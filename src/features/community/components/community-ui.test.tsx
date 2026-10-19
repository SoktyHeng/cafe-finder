import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthStateProvider, type AuthState } from "@/features/auth/auth-provider";
import type { AmenitySummary, CommunityPlaceResponse } from "@/lib/community/schemas";

import { CommunityBadges } from "./community-badges";
import { CommunitySection } from "./community-section";

vi.mock("next/navigation", () => ({ usePathname: () => "/cafes/ChIJplace1" }));

const REVIEW_ID = "7f4b2c1e-9a3d-4e5f-8b6c-1d2e3f4a5b6c";
const OWN_REVIEW_ID = "1a2b3c4d-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

const wifi: AmenitySummary = {
  amenity: "wifi",
  consensus: "yes",
  agreement: 1,
  score: 1,
  reportCount: 3,
  confirmedVisitCount: 1,
  latestObservedOn: "2026-10-10",
  conflicted: false,
  sufficient: true,
};

const base = (overrides: Partial<CommunityPlaceResponse> = {}): CommunityPlaceResponse => ({
  placeId: "ChIJplace1",
  amenities: [wifi, { ...wifi, amenity: "noise", consensus: "quiet", reportCount: 1, sufficient: false }],
  reviews: [
    {
      id: REVIEW_ID,
      rating: 4,
      body: "Bright and calm in the mornings, good for reading.",
      createdAt: "2026-10-01T00:00:00Z",
      edited: false,
      confirmedVisit: true,
      helpfulCount: 2,
      notHelpfulCount: 0,
      isOwn: false,
    },
  ],
  mine: null,
  ...overrides,
});

const MINE = { reports: [], review: null, votes: {}, flaggedReviewIds: [] };
const SIGNED_IN: AuthState = { status: "signed-in", user: { id: "u", email: null } };

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let counter = 0;

function respondWith(data: CommunityPlaceResponse, mutation: Response = new Response(null, { status: 204 })) {
  fetchMock.mockImplementation(async (_url, init) =>
    !init || init.method === "GET" ? new Response(JSON.stringify(data)) : mutation.clone(),
  );
}

function renderSection(auth: AuthState) {
  // Unique place per test keeps the shared request de-duplication map isolated.
  counter += 1;
  return render(
    <AuthStateProvider value={auth}>
      <CommunitySection placeId={`ChIJplace${counter}`} placeName="Test Cafe" />
    </AuthStateProvider>,
  );
}

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("CommunitySection", () => {
  it("makes no request on a guest-only site", () => {
    renderSection({ status: "unavailable" });
    expect(screen.getByTestId("community-unavailable")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows labelled member summaries and reviews to guests, with a sign-in prompt", async () => {
    respondWith(base());
    renderSection({ status: "signed-out" });

    expect(await screen.findByText("Wi-Fi: Available")).toBeInTheDocument();
    expect(screen.getByText(/not Google/)).toBeInTheDocument();
    expect(screen.getByText("3 reports, 1 confirmed visit, latest Oct 2026")).toBeInTheDocument();
    expect(screen.getByText(/Not enough reports yet to affect recommendations/)).toBeInTheDocument();
    expect(screen.getByText("Power outlets: unknown")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in to report/i })).toHaveAttribute("href", "/login?next=%2Fcafes%2FChIJplace1");

    const review = screen.getByRole("article", { name: "Member review, 4 out of 5" });
    expect(within(review).getByText("Confirmed visit")).toBeInTheDocument();
    expect(within(review).getByText(/Cafe Finder member/)).toBeInTheDocument();
    expect(within(review).queryByRole("button", { name: /helpful/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Community guidelines" })).toHaveAttribute("href", "/community-guidelines");
  });

  it("lets members submit an amenity report", async () => {
    respondWith(base({ mine: MINE }));
    const user = userEvent.setup();
    renderSection(SIGNED_IN);

    const form = await screen.findByRole("form", { name: "Amenity report" });
    await user.click(within(form).getByRole("radio", { name: "Available" }));
    await user.click(within(form).getByRole("radio", { name: "Plenty" }));
    await user.click(within(form).getByRole("button", { name: "Submit report" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(true));
    const [url, init] = fetchMock.mock.calls.find(([, call]) => call?.method === "PUT") ?? [];
    expect(String(url)).toMatch(/\/api\/community\/ChIJplace\d+\/amenities$/);
    const body = JSON.parse(String(init?.body));
    expect(body.answers).toEqual([
      { amenity: "wifi", value: "yes" },
      { amenity: "outlets", value: "many" },
    ]);
    expect(body.observedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("asks for at least one answer", async () => {
    respondWith(base({ mine: MINE }));
    renderSection(SIGNED_IN);
    const form = await screen.findByRole("form", { name: "Amenity report" });
    await userEvent.click(within(form).getByRole("button", { name: "Submit report" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("Choose at least one answer.");
  });

  it("explains when a posted review is held for moderation", async () => {
    respondWith(base({ mine: MINE }), new Response(JSON.stringify({ status: "pending" }), { status: 200 }));
    const user = userEvent.setup();
    renderSection(SIGNED_IN);

    const form = await screen.findByRole("form", { name: "Your review" });
    await user.click(within(form).getByRole("radio", { name: "5 out of 5" }));
    await user.type(within(form).getByRole("textbox"), "Great place, call 012 345 678 to book.");
    await user.click(within(form).getByRole("button", { name: "Post review" }));
    expect(await within(form).findByRole("status")).toHaveTextContent(/moderator will check it first/);
  });

  it("validates review length before sending", async () => {
    respondWith(base({ mine: MINE }));
    const user = userEvent.setup();
    renderSection(SIGNED_IN);
    const form = await screen.findByRole("form", { name: "Your review" });
    await user.click(within(form).getByRole("radio", { name: "3 out of 5" }));
    await user.type(within(form).getByRole("textbox"), "Too short");
    await user.click(within(form).getByRole("button", { name: "Post review" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("Write at least 20 characters.");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("offers voting and flagging on others' reviews only", async () => {
    respondWith(
      base({
        mine: { ...MINE, votes: { [REVIEW_ID]: true } },
        reviews: [
          ...base().reviews,
          { ...base().reviews[0]!, id: OWN_REVIEW_ID, isOwn: true, rating: 5 },
        ],
      }),
    );
    const user = userEvent.setup();
    renderSection(SIGNED_IN);

    const others = await screen.findByRole("article", { name: "Member review, 4 out of 5" });
    expect(within(others).getByRole("button", { name: "Helpful" })).toHaveAttribute("aria-pressed", "true");
    const own = screen.getByRole("article", { name: "Member review, 5 out of 5" });
    expect(within(own).queryByRole("button", { name: /helpful|report/i })).not.toBeInTheDocument();
    expect(within(own).getByText("You")).toBeInTheDocument();

    // Clicking an active vote removes it.
    await user.click(within(others).getByRole("button", { name: "Helpful" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true));

    // Voting refreshes the section, so look the review up again.
    const refreshed = await screen.findByRole("article", { name: "Member review, 4 out of 5" });
    await user.click(within(refreshed).getByRole("button", { name: "Report" }));
    await user.selectOptions(within(refreshed).getByLabelText("Reason for reporting"), "offensive");
    await user.click(within(refreshed).getByRole("button", { name: "Send report" }));
    await waitFor(() => {
      const flag = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(JSON.parse(String(flag?.[1]?.body))).toEqual({ targetType: "review", targetId: REVIEW_ID, reason: "offensive" });
    });
  });

  it("shows a clear message when community data is unavailable", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { code: "UPSTREAM_UNAVAILABLE", message: "x" } }), { status: 503 }));
    renderSection({ status: "signed-out" });
    expect(await screen.findByText(/aren.t available right now/)).toBeInTheDocument();
  });
});

describe("CommunityBadges", () => {
  it("shows only sufficient evidence, labelled as member content", () => {
    render(
      <CommunityBadges
        summaries={[wifi, { ...wifi, amenity: "noise", consensus: "quiet", sufficient: false }, { ...wifi, amenity: "outlets", conflicted: true }]}
      />,
    );
    expect(screen.getByText(/From Cafe Finder members \(not Google\)/)).toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: "Member reports" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["Wi-Fi: Available · 3 reports", "Power outlets: mixed reports · 3 reports"]);
  });

  it("renders nothing without sufficient evidence", () => {
    const { container } = render(<CommunityBadges summaries={[{ ...wifi, sufficient: false }]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
