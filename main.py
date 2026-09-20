"""Deck Game Tune — backend.

Deliberately small. All the settings work happens on the frontend through
SteamClient; this side only does two things the frontend cannot:

  1. read the DMI strings that identify which handheld this is, and
  2. persist revert snapshots to disk so they survive a Steam UI restart.

Nothing here writes outside DECKY_PLUGIN_SETTINGS_DIR, which is why the
plugin needs no root. Keep it that way.
"""

import json
import os
from typing import Any, Optional

import decky

SNAPSHOT_FILE = "snapshots.json"


class Plugin:
    # ---------------------------------------------------------------- device

    async def get_device_dmi(self) -> dict[str, str]:
        """Identify the hardware.

        On Valve hardware `product_name` is the codename: Jupiter = Steam Deck
        LCD, Galileo = Steam Deck OLED. The two differ enough in APU efficiency
        and battery capacity that community reports must not be mixed, so the
        frontend keys off this.
        """
        return {
            "vendor": self._read_dmi("sys_vendor"),
            "product": self._read_dmi("product_name"),
        }

    def _read_dmi(self, name: str) -> str:
        path = os.path.join("/sys/class/dmi/id", name)
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as handle:
                return handle.read().strip()
        except OSError as err:
            decky.logger.warning("could not read %s: %s", path, err)
            return ""

    # -------------------------------------------------------------- snapshots

    async def save_snapshot(self, app_id: int, snapshot: Any) -> bool:
        """Store the pre-apply state for one app, so a revert is always possible."""
        data = self._read_snapshots()
        data[str(app_id)] = snapshot
        return self._write_snapshots(data)

    async def get_snapshot(self, app_id: int) -> Optional[Any]:
        return self._read_snapshots().get(str(app_id))

    async def delete_snapshot(self, app_id: int) -> bool:
        data = self._read_snapshots()
        if data.pop(str(app_id), None) is None:
            return True
        return self._write_snapshots(data)

    async def list_snapshot_app_ids(self) -> list[int]:
        out: list[int] = []
        for key in self._read_snapshots():
            try:
                out.append(int(key))
            except ValueError:
                continue
        return out

    def _snapshot_path(self) -> str:
        return os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, SNAPSHOT_FILE)

    def _read_snapshots(self) -> dict[str, Any]:
        path = self._snapshot_path()
        try:
            with open(path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
        except FileNotFoundError:
            return {}
        except (OSError, json.JSONDecodeError) as err:
            # A corrupt snapshot file must not take the plugin down, but losing
            # someone's revert data silently would be worse — say so loudly.
            decky.logger.error("snapshot file unreadable (%s): %s", path, err)
            return {}
        return data if isinstance(data, dict) else {}

    def _write_snapshots(self, data: dict[str, Any]) -> bool:
        path = self._snapshot_path()
        tmp = path + ".tmp"
        try:
            os.makedirs(decky.DECKY_PLUGIN_SETTINGS_DIR, exist_ok=True)
            # Write-then-rename: a half-written snapshot file would mean an
            # un-revertable apply.
            with open(tmp, "w", encoding="utf-8") as handle:
                json.dump(data, handle, indent=2)
            os.replace(tmp, path)
            return True
        except OSError as err:
            decky.logger.error("could not write snapshots to %s: %s", path, err)
            return False

    # ------------------------------------------------------------- lifecycle

    async def _main(self) -> None:
        decky.logger.info("Deck Game Tune loaded")

    async def _unload(self) -> None:
        decky.logger.info("Deck Game Tune unloaded")

    async def _uninstall(self) -> None:
        decky.logger.info("Deck Game Tune uninstalled")
