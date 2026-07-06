import { useJourney } from "../state/journey";
import { useLang } from "../i18n/lang";

/**
 * Persistent live-mode warning. Shown only when mode === "live". The cleanup
 * link jumps to Step 9 so a live run can always be torn down.
 */
export function LiveBanner() {
  const { state, dispatch } = useJourney();
  const { t } = useLang();
  if (state.mode !== "live") return null;

  const acct = state.liveIdentity?.account;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-aws-orange/30 bg-aws-orange/10 px-4 py-2 text-xs sm:px-6"
    >
      <span className="font-semibold text-aws-orange-soft">
        {t.banner.warning}
      </span>
      {acct && (
        <span className="font-mono text-fog-400">
          {t.banner.account} {acct}
        </span>
      )}
      <button
        type="button"
        onClick={() => dispatch({ type: "GO_TO", step: "cleanup" })}
        className="ml-auto font-mono text-cyan-soft underline-offset-2 hover:underline"
      >
        {t.banner.goToCleanup}
      </button>
    </div>
  );
}
