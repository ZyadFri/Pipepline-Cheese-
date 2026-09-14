"""
Shared helpers for record_demo_01.py / record_demo_02.py.

This machine's Playwright<->Chromium CDP round-trip is unusually slow under
load (measured ~300ms per individual protocol call during development, from
system contention rather than resolution). Every helper here is written to
need at most ONE Python->browser round trip per gesture — typing and scrolling
animate entirely inside the browser (JS setTimeout/native smooth-scroll), so
on-screen motion stays smooth regardless of that per-call tax. Playwright's
own video recorder is hard-capped at 25fps (measured directly, not assumed)
regardless of resolution - see DEMO_RECORDING_NOTES.md.
"""
import time


def smooth_scroll_to(page, y: int, duration_ms: int = 900) -> None:
    """Native CSS/JS smooth scroll — one call, browser-side easing."""
    page.evaluate(
        "(y) => window.scrollTo({top: y, left: 0, behavior: 'smooth'})", y
    )
    page.wait_for_timeout(duration_ms)


def eased_move(page, x: int, y: int, steps: int = 20) -> None:
    """Cursor glide to an absolute point. Playwright dispatches the
    intermediate points itself in one call."""
    page.mouse.move(x, y, steps=steps)


def eased_click_center(page, locator, pre_pause_ms: int = 250) -> None:
    """Move the cursor to an element's center, pause briefly (as if aiming),
    then click — avoids an instant teleport-click."""
    box = locator.bounding_box()
    if box:
        cx = box["x"] + box["width"] / 2
        cy = box["y"] + box["height"] / 2
        eased_move(page, cx, cy)
        page.wait_for_timeout(pre_pause_ms)
    locator.click()


def type_into(page, selector: str, text: str, char_delay_ms: int = 55) -> None:
    """Type into a React-controlled <input> with visible per-character
    animation, entirely inside the browser (one CDP call total). Uses the
    native value-setter + a real 'input' event so React's onChange fires,
    exactly like a real keystroke would."""
    page.eval_on_selector(
        selector,
        """
        async (el, {text, delay}) => {
            el.focus();
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            ).set;
            let cur = '';
            for (const ch of text) {
                cur += ch;
                setter.call(el, cur);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(r => setTimeout(r, delay));
            }
        }
        """,
        {"text": text, "delay": char_delay_ms},
    )


class SceneTimer:
    """Tracks wall-clock duration of each scene for DEMO_RECORDING_NOTES.md."""

    def __init__(self):
        self.log = []
        self._t0 = None
        self._name = None

    def start(self, name: str):
        self._name = name
        self._t0 = time.perf_counter()
        print(f"-- scene start: {name}")

    def end(self):
        elapsed = time.perf_counter() - self._t0
        self.log.append((self._name, elapsed))
        print(f"-- scene end: {self._name} ({elapsed:.1f}s)")

    def report(self) -> str:
        lines = [f"{name}: {elapsed:.1f}s" for name, elapsed in self.log]
        lines.append(f"TOTAL: {sum(e for _, e in self.log):.1f}s")
        return "\n".join(lines)
