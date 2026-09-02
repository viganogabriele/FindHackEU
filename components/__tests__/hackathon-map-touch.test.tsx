// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { TranslationProvider } from "@/contexts/translation-context";

const map = {
  dragging: { enable: vi.fn(), disable: vi.fn() },
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock("react-leaflet", () => ({
  useMap: () => map,
  MapContainer: () => null,
  Marker: () => null,
  Popup: () => null,
  TileLayer: () => null,
}));
vi.mock("react-leaflet-cluster", () => ({ default: () => null }));

import { TouchDragGate } from "@/components/hackathon-map";

function setPointer(coarse: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: coarse,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function renderGate() {
  return render(
    <TranslationProvider>
      <TouchDragGate />
    </TranslationProvider>,
  );
}

beforeEach(() => {
  map.dragging.enable.mockClear();
  map.dragging.disable.mockClear();
  map.on.mockClear();
  map.off.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TouchDragGate", () => {
  it("leaves a mouse/trackpad map completely alone", () => {
    setPointer(false);
    renderGate();

    expect(map.dragging.disable).not.toHaveBeenCalled();
    expect(map.on).not.toHaveBeenCalled();
    expect(screen.queryByText(/tap the map/i)).toBeNull();
  });

  // Without this, a one-finger swipe starting over the map pans the map
  // instead of scrolling the page - and the map is most of a phone's
  // viewport, so the page feels stuck.
  it("holds off panning on a touch device until the map is tapped", () => {
    setPointer(true);
    renderGate();

    expect(map.dragging.disable).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/tap the map/i)).toBeTruthy();

    const [event, activate] = map.on.mock.calls[0] as [string, () => void];
    expect(event).toBe("click");

    // Leaflet calls this from its own event handler, outside React.
    act(() => activate());

    expect(map.dragging.enable).toHaveBeenCalled();
    expect(screen.queryByText(/tap the map/i)).toBeNull();
  });

  it("never leaves an un-pannable map behind on unmount", () => {
    setPointer(true);
    const { unmount } = renderGate();

    expect(map.dragging.disable).toHaveBeenCalled();
    unmount();

    expect(map.off).toHaveBeenCalled();
    expect(map.dragging.enable).toHaveBeenCalled();
  });
});
