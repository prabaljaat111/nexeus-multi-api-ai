import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const Icon = theme === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme">
          <Icon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <DropdownMenuRadioItem value="light"><Sun className="mr-2 size-4" />Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><Moon className="mr-2 size-4" />Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system"><Monitor className="mr-2 size-4" />System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
