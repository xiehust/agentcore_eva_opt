import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { JourneyProvider } from "../state/journey";
import { StepHeader } from "./StepScaffold";
import { en, zh } from "../i18n/messages";
import { STEPS } from "./manifest";

function renderHeader() {
  return render(
    <JourneyProvider>
      <StepHeader
        index={9}
        title={en.steps.targetAB.title}
        lede={en.steps.targetAB.lede}
        learn={en.steps.targetAB.learn}
      />
    </JourneyProvider>,
  );
}

describe("StepHeader learn-more panel", () => {
  it("is collapsed by default and expands with purpose/concepts/takeaway", () => {
    renderHeader();
    expect(screen.queryByTestId("learn-panel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("learn-toggle"));
    const panel = screen.getByTestId("learn-panel");
    expect(panel).toHaveTextContent(/purpose/i);
    expect(panel).toHaveTextContent(/key concepts/i);
    expect(panel).toHaveTextContent(/takeaway/i);
    // Canary-specific teaching content is present.
    expect(panel).toHaveTextContent(/blast radius/i);
    expect(panel).toHaveTextContent(/90\/10/);

    // Collapse: AnimatePresence keeps the exiting node briefly (jsdom has no
    // real animation frames), so assert the toggle state instead.
    fireEvent.click(screen.getByTestId("learn-toggle"));
    expect(screen.getByTestId("learn-toggle")).toHaveAttribute("aria-expanded", "false");
  });
});

describe("steps learn content", () => {
  it("every step has purpose, 2+ concept points, and a takeaway in BOTH locales", () => {
    for (const step of STEPS) {
      for (const catalog of [en, zh]) {
        const learn = catalog.steps[step.key].learn;
        expect(learn.purpose.length, `${step.key} purpose`).toBeGreaterThan(50);
        expect(learn.points.length, `${step.key} points`).toBeGreaterThanOrEqual(2);
        for (const [term, explanation] of learn.points) {
          expect(term.length).toBeGreaterThan(0);
          expect(explanation.length).toBeGreaterThan(20);
        }
        expect(learn.takeaway.length, `${step.key} takeaway`).toBeGreaterThan(10);
      }
    }
  });
});
