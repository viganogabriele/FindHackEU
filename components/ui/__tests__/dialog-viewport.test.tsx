// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

afterEach(cleanup);

/**
 * Both dialog surfaces are `position: fixed` and centred with
 * `top-1/2 translate-y-[-50%]`. Without a height bound they simply grow past
 * both edges of the viewport, and because they're fixed they don't
 * participate in page scrolling and Radix locks the body scroll while one is
 * open - so the overflowing parts are unreachable.
 *
 * On a phone that broke the public "Suggest a hackathon" form outright: six
 * fields plus ten topic chips plus a footer is taller than a portrait
 * viewport, and the submit button was the part that fell off the bottom.
 *
 * jsdom does no layout, so these assert the mechanism (a viewport-relative
 * cap plus internal scrolling) rather than measured pixels.
 */
function expectFitsViewport(element: HTMLElement) {
  const className = element.className;
  // `dvh`, not `vh`: mobile browsers report `vh` against the *largest*
  // viewport, i.e. with the URL bar hidden, which is exactly the case where
  // the cap needs to be tightest.
  expect(className).toContain("max-h-[calc(100dvh-2rem)]");
  expect(className).toContain("overflow-y-auto");
  // Keeps a scroll gesture that reaches the end of the dialog from chaining
  // into whatever is behind it.
  expect(className).toContain("overscroll-contain");
}

describe("dialog viewport fit", () => {
  it("keeps DialogContent inside the viewport and scrollable", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Suggest a hackathon</DialogTitle>
          <DialogDescription>A very tall form.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    expectFitsViewport(screen.getByRole("dialog"));
  });

  it("keeps AlertDialogContent inside the viewport and scrollable", () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Delete this?</AlertDialogTitle>
          <AlertDialogDescription>No undo.</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>,
    );

    expectFitsViewport(screen.getByRole("alertdialog"));
  });

  it("still lets a caller override the width without losing the height cap", () => {
    render(
      <Dialog open>
        <DialogContent className="sm:max-w-2xl">
          <DialogTitle>Wide</DialogTitle>
          <DialogDescription>Still bounded vertically.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    const content = screen.getByRole("dialog");
    expectFitsViewport(content);
    expect(content.className).toContain("sm:max-w-2xl");
  });
});
