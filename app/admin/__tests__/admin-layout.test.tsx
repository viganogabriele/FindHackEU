// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AdminLayout from "../layout";

afterEach(cleanup);

describe("AdminLayout", () => {
  it("wraps every admin route in the fixed dark admin theme scope", () => {
    render(
      <AdminLayout>
        <span>Admin content</span>
      </AdminLayout>,
    );

    const shell = screen.getByTestId("admin-theme-shell");
    expect(shell.classList.contains("admin-theme")).toBe(true);
    expect(shell.classList.contains("dark")).toBe(true);
    expect(shell.getAttribute("data-theme")).toBe("admin");
    expect(screen.getByText("Admin content")).toBeTruthy();
  });
});
