import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LangProvider, LangToggle } from "./index";
import { getInitialLang, useLang } from "./lang";
import { MESSAGES, zh, en } from "./messages";
import App from "../App";

function Probe() {
  const { lang, t } = useLang();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="title">{t.shell.appTitle}</span>
    </div>
  );
}

describe("i18n defaults", () => {
  beforeEach(() => localStorage.removeItem("lab4.lang"));

  it("defaults to Chinese when no stored preference", () => {
    expect(getInitialLang()).toBe("zh");
  });

  it("respects a stored language preference", () => {
    localStorage.setItem("lab4.lang", "en");
    expect(getInitialLang()).toBe("en");
  });

  it("renders Chinese by default and toggles to English, persisting", () => {
    render(
      <LangProvider>
        <LangToggle />
        <Probe />
      </LangProvider>,
    );
    expect(screen.getByTestId("lang").textContent).toBe("zh");
    expect(screen.getByTestId("title").textContent).toBe("AgentCore 优化");

    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByTestId("lang").textContent).toBe("en");
    expect(screen.getByTestId("title").textContent).toBe(
      "AgentCore Optimization",
    );
    expect(localStorage.getItem("lab4.lang")).toBe("en");
  });

  it("landing page shows Chinese hero by default", async () => {
    render(<App />);
    // First paint is async: the LoginGate probes /api/auth/status on mount.
    expect(await screen.findByText(/端到端全流程/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /开始旅程/ }),
    ).toBeInTheDocument();
  });
});

describe("message catalogs", () => {
  it("zh and en expose identical step keys", () => {
    expect(Object.keys(zh.steps).sort()).toEqual(Object.keys(en.steps).sort());
  });

  it("zh and en cover the same evaluator ids", () => {
    expect(Object.keys(zh.evaluators.labels).sort()).toEqual(
      Object.keys(en.evaluators.labels).sort(),
    );
    expect(Object.keys(zh.evaluators.descriptions).sort()).toEqual(
      Object.keys(en.evaluators.descriptions).sort(),
    );
  });

  it("zh and en cover the same cleanup categories and summary steps", () => {
    expect(Object.keys(zh.step9.cleanupItems).sort()).toEqual(
      Object.keys(en.step9.cleanupItems).sort(),
    );
    expect(Object.keys(zh.step9.summaryActions).sort()).toEqual(
      Object.keys(en.step9.summaryActions).sort(),
    );
  });

  it("MESSAGES maps both languages", () => {
    expect(MESSAGES.zh).toBe(zh);
    expect(MESSAGES.en).toBe(en);
  });
});
