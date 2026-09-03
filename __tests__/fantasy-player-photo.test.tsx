/// <reference types="jest" />

/**
 * PlayerPhoto fallback chain: provider headshot → stylized club kit →
 * caller-supplied fallback. photo_url is null unless fantasy_settings
 * .photos_enabled is on, so these cases also cover the flag being off.
 */
import { fireEvent, render, screen } from "@testing-library/react";

import { PlayerPhoto } from "../app/components/play/PitchView";
import type { FantasyPlayer } from "../app/components/play/types";

const player = (over: Partial<FantasyPlayer> = {}): FantasyPlayer => ({
  provider_player_id: 1,
  team_id: 42, // Arsenal, present in CLUB_KITS
  name: "Bukayo Saka",
  nation: "England",
  position: "MID",
  price: 10,
  photo_url: null,
  is_active: true,
  ...over,
});

const markup = (p: FantasyPlayer) => (
  <PlayerPhoto
    player={p}
    className="size-12"
    fallback={<span data-testid="fallback">BS</span>}
  />
);

/** The headshot renders as alt="" so it carries no accessible role. */
const headshot = (container: HTMLElement) => container.querySelector("img");
/** ClubJersey renders an inline <svg role="img" aria-label="… kit">. */
const kit = () => screen.queryByRole("img", { name: /kit/i });

describe("PlayerPhoto", () => {
  it("renders the headshot when photos are enabled", () => {
    const { container } = render(
      markup(player({ photo_url: "https://media.example/17.png" })),
    );

    const img = headshot(container);
    expect(img).toHaveAttribute("src", "https://media.example/17.png");
    // Size comes from the caller, crop styling from the component.
    expect(img?.className).toContain("size-12");
    expect(img?.className).toContain("rounded-full");
    expect(img?.className).toContain("object-cover");
    expect(kit()).toBeNull();
  });

  it("falls back to the club kit when photos are disabled", () => {
    const { container } = render(markup(player({ photo_url: null })));

    expect(headshot(container)).toBeNull();
    expect(screen.queryByTestId("fallback")).toBeNull();
    expect(kit()).toBeInTheDocument();
  });

  it("degrades to the club kit when a headshot fails to load", () => {
    const { container } = render(
      markup(player({ photo_url: "https://media.example/broken.png" })),
    );

    fireEvent.error(headshot(container)!);

    expect(headshot(container)).toBeNull();
    expect(kit()).toBeInTheDocument();
  });

  it("uses the caller fallback only when there is no photo and no club", () => {
    render(markup(player({ photo_url: null, team_id: 0 })));

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(kit()).toBeNull();
  });

  it("does not let one broken headshot suppress the next player's photo", () => {
    // These components are reused across players in scrolling lists. A boolean
    // "failed" flag would leak across that reuse; a remembered URL does not.
    const { container, rerender } = render(
      markup(player({ photo_url: "https://media.example/broken.png" })),
    );

    fireEvent.error(headshot(container)!);
    expect(headshot(container)).toBeNull();

    rerender(
      markup(
        player({
          provider_player_id: 2,
          name: "Declan Rice",
          photo_url: "https://media.example/good.png",
        }),
      ),
    );

    expect(headshot(container)).toHaveAttribute(
      "src",
      "https://media.example/good.png",
    );
  });
});
