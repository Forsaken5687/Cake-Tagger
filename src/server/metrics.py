"""OS diagnostics for this process, without inspecting other applications."""

import ctypes
import os

from .core import resident_bytes


def memory_snapshot():
    host = None
    if hasattr(ctypes, "windll"):

        class Memory(ctypes.Structure):
            _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong)] + [
                (name, ctypes.c_ulonglong)
                for name in [
                    "total",
                    "free",
                    "totalPage",
                    "freePage",
                    "totalVirtual",
                    "freeVirtual",
                    "extended",
                ]
            ]

        state = Memory()
        state.length = ctypes.sizeof(state)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(state)):
            host = dict(totalBytes=int(state.total), freeBytes=int(state.free))
    elif hasattr(os, "sysconf"):
        try:
            host = dict(
                totalBytes=os.sysconf("SC_PHYS_PAGES") * os.sysconf("SC_PAGE_SIZE"),
                freeBytes=os.sysconf("SC_AVPHYS_PAGES") * os.sysconf("SC_PAGE_SIZE"),
            )
        except (ValueError, OSError):
            pass
    # JavaScript heap fields are intentionally absent: they do not describe Python.
    rss = resident_bytes()
    return dict(
        hostMemory=host,
        serverMemory=dict(rssBytes=rss, scope="process-rss")
        if rss is not None
        else None,
        inferenceRssBytes=rss,
    )


def process_priority():
    if hasattr(ctypes, "windll"):
        api = ctypes.windll.kernel32
        api.GetCurrentProcess.restype = ctypes.c_void_p
        api.GetPriorityClass.argtypes = [ctypes.c_void_p]
        return {0x20: "normal", 0x4000: "below-normal"}.get(
            api.GetPriorityClass(api.GetCurrentProcess()), "other"
        )
    return "unknown"
