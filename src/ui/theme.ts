export type InterfaceTheme = "light" | "dark" | "auto";

const AUTO_LIGHT_START_HOUR = 7;
const AUTO_DARK_START_HOUR = 19;

let autoTimer: number | null = null;

const clearAutoTimer = () => {
  if (autoTimer !== null) {
    window.clearTimeout(autoTimer);
    autoTimer = null;
  }
};

const resolveAutoTheme = (now: Date): "light" | "dark" => {
  const hour = now.getHours();
  if (hour >= AUTO_LIGHT_START_HOUR && hour < AUTO_DARK_START_HOUR) {
    return "light";
  }
  return "dark";
};

const getNextAutoBoundary = (now: Date): Date => {
  const lightStart = new Date(now);
  lightStart.setHours(AUTO_LIGHT_START_HOUR, 0, 0, 0);

  const darkStart = new Date(now);
  darkStart.setHours(AUTO_DARK_START_HOUR, 0, 0, 0);

  if (now < lightStart) {
    return lightStart;
  }
  if (now < darkStart) {
    return darkStart;
  }

  const nextLight = new Date(now);
  nextLight.setDate(nextLight.getDate() + 1);
  nextLight.setHours(AUTO_LIGHT_START_HOUR, 0, 0, 0);
  return nextLight;
};

const setThemeClass = (resolved: "light" | "dark") => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.interfaceTheme = resolved;
};

export const applyInterfaceTheme = (theme: InterfaceTheme | undefined): void => {
  if (typeof window === "undefined") return;
  clearAutoTimer();

  const setting: InterfaceTheme = theme ?? "auto";
  const now = new Date();
  const resolved = setting === "auto" ? resolveAutoTheme(now) : setting;
  setThemeClass(resolved);

  if (setting === "auto") {
    const next = getNextAutoBoundary(now);
    const delay = Math.max(10_000, next.getTime() - now.getTime());
    autoTimer = window.setTimeout(() => applyInterfaceTheme("auto"), delay);
  }
};

