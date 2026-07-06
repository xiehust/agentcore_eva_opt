import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiffView } from "./DiffView";

describe("DiffView", () => {
  it("marks the after pane as changed when texts differ", () => {
    const { container } = render(
      <DiffView before="old text" after="new improved text" />,
    );
    expect(container.querySelector('[data-changed="true"]')).toBeTruthy();
    expect(screen.getByText(/changed/i)).toBeInTheDocument();
  });

  it("does not mark changed when before and after are equal", () => {
    const { container } = render(<DiffView before="same" after="same" />);
    expect(container.querySelector('[data-changed="false"]')).toBeTruthy();
    expect(screen.queryByText(/changed/i)).not.toBeInTheDocument();
  });

  it("renders both the before and after text", () => {
    render(<DiffView before="alpha" after="beta" />);
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });
});
