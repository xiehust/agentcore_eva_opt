import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LangProvider } from "../i18n";
import { LoginGate } from "./LoginGate";

function stubFetch(opts: { required: boolean; accept?: string }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/api/auth/status")) {
      return { ok: true, json: async () => ({ authRequired: opts.required, authenticated: false }) };
    }
    if (url.endsWith("/api/auth/login")) {
      const body = JSON.parse(String(init?.body));
      const ok = body.password === (opts.accept ?? "");
      return { ok, status: ok ? 200 : 401, json: async () => ({}) };
    }
    return { ok: true, json: async () => ({}) };
  });
  return { fn, calls };
}

function renderGate() {
  return render(
    <LangProvider>
      <LoginGate>
        <div data-testid="app-content">app</div>
      </LoginGate>
    </LangProvider>,
  );
}

describe("LoginGate", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders children directly when auth is not required", async () => {
    vi.stubGlobal("fetch", stubFetch({ required: false }).fn);
    renderGate();
    expect(await screen.findByTestId("app-content")).toBeInTheDocument();
  });

  it("renders children when the backend is unreachable (sim still works)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    renderGate();
    expect(await screen.findByTestId("app-content")).toBeInTheDocument();
  });

  it("blocks with a password form; wrong password shows an error", async () => {
    vi.stubGlobal("fetch", stubFetch({ required: true, accept: "right" }).fn);
    renderGate();
    const input = await screen.findByLabelText(/access password/i);
    expect(screen.queryByTestId("app-content")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect/i);
    expect(screen.queryByTestId("app-content")).not.toBeInTheDocument();
  });

  it("unlocks after a successful login", async () => {
    const stub = stubFetch({ required: true, accept: "s3cret" });
    vi.stubGlobal("fetch", stub.fn);
    renderGate();
    fireEvent.change(await screen.findByLabelText(/access password/i), {
      target: { value: "s3cret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByTestId("app-content")).toBeInTheDocument();
    await waitFor(() => {
      const login = stub.calls.find((c) => c.url.endsWith("/api/auth/login"));
      expect(JSON.parse(String(login!.init!.body))).toEqual({ password: "s3cret" });
    });
  });
});
