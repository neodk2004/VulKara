# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Oliver Schmidt
"""Line protocol between the app (src/main/engines.ts) and an engine process.

In:  one JSON object per line, {"op": "generate" | "preview" | "stop" | "unload" | "ping", "job": {...}}
Out: one event per line, "@vk " followed by JSON, {"event": "state" | "progress" | "status" | "result" | "error" |
     "preview" | "pong", ...}. Other output on stdout (libraries) is not an event and only logged by the app.

A reader thread owns stdin, so a stop request is seen while a job runs and no other request is lost.
"""
import json
import queue
import sys
import threading

PREFIX = "@vk "
OPS = ("generate", "preview", "stop", "unload", "ping")


def parse_line(line):
    """(op, job) of a request line, None for anything else."""
    line = line.strip()
    if not line.startswith("{"):
        return None
    try:
        req = json.loads(line)
    except ValueError:
        return None
    if not isinstance(req, dict) or req.get("op") not in OPS:
        return None
    job = req.get("job")
    return req["op"], job if isinstance(job, dict) else {}


# requests that start a job; a stop after one of them is about that job
JOB_OPS = ("generate", "preview")


def describe(e):
    """An error as the app shows it: a missing key of the job or of a model.json is named as such."""
    if isinstance(e, KeyError):
        return "The job or the model's model.json lacks %s" % (e.args[0] if e.args else "a value")
    return str(e)


class CommandReader:
    def __init__(self, stream=None):
        self.stream = stream or sys.stdin
        self.commands = queue.Queue()
        self.stop_event = threading.Event()
        self.closed = threading.Event()
        self.thread = threading.Thread(target=self._run, daemon=True)

    def start(self):
        self.thread.start()
        return self

    def _run(self):
        for line in self.stream:
            parsed = parse_line(line)
            if parsed is None:
                continue
            if parsed[0] == "stop":
                self.stop_event.set()
            else:
                if parsed[0] in JOB_OPS:
                    # a stop is about the job read before it: cleared here, in the order of stdin, not when the
                    # job starts (a stop sent while the engine was still starting or loading would be lost then)
                    self.stop_event.clear()
                self.commands.put(parsed)
        self.closed.set()
        self.commands.put(None)

    def next_command(self):
        """Blocks until a request arrives: (op, job); None once stdin is closed."""
        return self.commands.get()

    def stop_requested(self):
        return self.stop_event.is_set()


def event(name, **fields):
    sys.stdout.write(PREFIX + json.dumps(dict(event=name, **fields)) + "\n")
    sys.stdout.flush()


def note(message):
    """How the job was made, shown with its result (e.g. step caching)."""
    event("note", message=message)


def state(value):
    """"loaded" (process started), "idle" (ready for a job), "busy" (working on one)."""
    event("state", state=value)


def progress(value):
    """Percent of the current job, -1 while it can not be told."""
    event("progress", value=value)


def status(message):
    event("status", message=message)


def result(path):
    event("result", path=str(path))


def error(message):
    event("error", message=str(message))


def preview(info):
    """{"model", "preview"} or {"model", "error"}: a model painted its own preview picture."""
    event("preview", **info)


def log(*args):
    print(*args, file=sys.stderr, flush=True)
