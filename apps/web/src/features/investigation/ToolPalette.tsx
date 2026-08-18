import { Button } from "@/components/ui/Button";
import { TOOL_PALETTE } from "./commands";

interface ToolPaletteProps {
  onPick: (command: string) => void;
  disabled?: boolean;
}

export function ToolPalette({ onPick, disabled }: ToolPaletteProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TOOL_PALETTE.map((tool) => (
        <Button
          key={tool.id}
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          title={tool.command}
          onClick={() => onPick(tool.command)}
        >
          {tool.label}
          <span className="font-mono text-[10px] text-nexus-amber/80">{tool.cost}</span>
        </Button>
      ))}
    </div>
  );
}
