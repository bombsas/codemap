/**
 * ViewToggle — three buttons to switch between block, dependency, and mind-map views.
 * Renders as a small segmented control in the top toolbar area.
 */
import { memo } from "react";
import { LayoutGrid, ArrowRightLeft, GitFork } from "lucide-react";
import { useVisualizationStore, type ViewMode } from "../../store/visualizationStore";

const VIEWS: { mode: ViewMode; label: string; Icon: typeof LayoutGrid }[] = [
  { mode: "block", label: "Block", Icon: LayoutGrid },
  { mode: "dependency", label: "Dependencies", Icon: ArrowRightLeft },
  { mode: "mindmap", label: "Mind-map", Icon: GitFork },
];

function ViewToggleComponent() {
  const { viewMode, setViewMode } = useVisualizationStore();

  return (
    <div className="flex items-center overflow-hidden rounded-lg border border-border bg-surface">
      {VIEWS.map(({ mode, label, Icon }) => {
        const active = viewMode === mode;
        return (
          <button
            key={mode}
            className={`flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-[11px] transition-all duration-150 active:scale-[0.97] ${
              active
                ? "bg-accent text-background font-semibold"
                : "text-muted hover:text-foreground hover:bg-muted/30"
            }`}
            onClick={() => setViewMode(mode)}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default memo(ViewToggleComponent);