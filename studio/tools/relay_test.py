"""The relay against a fake tab, a hostile page and a client without a bearer.

Starts shell/freeinference-relay.py on a free port, plays the tab side of its protocol exactly as
shell/shell.js does (hello from an allowed origin with the custom header, the token on every call,
long poll /tab/next, post result or head, frame, frame, [DONE]), and asserts what the relay must
refuse: a page on another origin, a tab call without the token, a client call without an
Authorization header, a second tab while one serves, a body above the cap, and a bind to any host
but loopback. Standard library only. Run from the project root: python3 tools/relay_test.py
"""
import json, os, pathlib, socket, subprocess, sys, threading, time, urllib.error, urllib.request

root = pathlib.Path(__file__).resolve().parent.parent
RELAY = root / "site" / "freeinference-relay.py"
PAGE = "https://uor-foundation.github.io"
HOSTILE = "https://evil.example"


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close(); return port


PORT = free_port()
BASE = "http://127.0.0.1:%d" % PORT
checks = []


def check(name, ok, detail=""):
    checks.append((name, ok))
    print(("  ok   " if ok else "  FAIL ") + name + (("  " + detail) if detail and not ok else ""))


def http(method, path, body=None, headers=None, origin=None, timeout=30):
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, method=method)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    if origin:
        req.add_header("Origin", origin)
    if data is not None and "Content-Type" not in (headers or {}):
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def stream(method, path, body, headers):
    """Reads an event stream line by line until [DONE], as an SSE client does."""
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), method=method)
    for k, v in headers.items():
        req.add_header(k, v)
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=30) as r:
        frames = []
        while True:
            line = r.readline().decode().rstrip("\n")
            if line.startswith("data: "):
                frames.append(line[6:])
                if line == "data: [DONE]":
                    break
            if not line and r.fp is None:
                break
        return r.status, dict(r.headers), frames


# ---- the relay process
env = {**os.environ, "FREEINFERENCE_RELAY_PORT": str(PORT), "FREEINFERENCE_RELAY_TIMEOUT": "10"}
proc = subprocess.Popen([sys.executable, str(RELAY)], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
for _ in range(100):
    try:
        status, _, _ = http("GET", "/healthz"); break
    except Exception:
        time.sleep(0.1)
else:
    proc.kill(); sys.exit("relay did not start")


# ---- the fake tab: what app.js does, with bytes standing in for the verified encoders
def tab(tab_id, token, stop):
    hdr = {"X-Freeinference-Tab": token, "X-Freeinference-Tab-Id": tab_id}
    while not stop.is_set():
        try:
            status, _, raw = http("GET", "/tab/next", headers=hdr, origin=PAGE, timeout=40)
        except Exception:
            break
        if status != 200:
            if status == 409:
                time.sleep(0.2)
            continue
        job = json.loads(raw)
        post = lambda action, payload: http("POST", "/tab/%s/%s" % (job["id"], action), payload, headers=hdr, origin=PAGE)
        if job["op"] == "models":
            post("result", {"bytes": '{"object":"list","data":[{"id":"webgpu:Bonsai","object":"model","created":0,"owned_by":"browser"}]}', "headers": {}})
            continue
        request = job["request"]
        text = "echo: " + request["messages"][-1]["content"]
        if request.get("stream"):
            post("head", {"headers": {"x-hologram-receipt": "blake3:stream", "x-hologram-stream": "native"}})
            post("frame", {"bytes": '{"choices":[{"delta":{"role":"assistant","content":""}}]}'})
            post("frame", {"bytes": '{"choices":[{"delta":{"content":%s}}]}' % json.dumps(text)})
            post("frame", {"bytes": '{"choices":[{"delta":{},"finish_reason":"stop"}],"hologram":{"receipt":"blake3:stream"}}'})
            post("frame", {"bytes": "[DONE]"})
        else:
            post("result", {"bytes": '{"choices":[{"message":{"role":"assistant","content":%s}}]}' % json.dumps(text),
                            "headers": {"x-hologram-receipt": "blake3:plain", "x-hologram-reuse": "1"}})


try:
    print("relay test on port %d" % PORT)
    # A page on another origin cannot read hello, with or without the header.
    s, _, _ = http("GET", "/tab/hello", headers={"X-Freeinference-Tab": "hello"}, origin=HOSTILE)
    check("hostile origin refused on /tab/hello", s == 403, str(s))
    s, h, _ = http("OPTIONS", "/tab/hello", origin=HOSTILE)
    check("hostile origin gets no CORS grant", "Access-Control-Allow-Origin" not in h, str(h))
    # The page's origin without the custom header is refused too: a simple request never reaches the tab side.
    s, _, _ = http("GET", "/tab/hello", origin=PAGE)
    check("tab route without the custom header refused", s == 403, str(s))
    s, h, raw = http("GET", "/tab/hello", headers={"X-Freeinference-Tab": "hello"}, origin=PAGE)
    hello = json.loads(raw) if s == 200 else {}
    token = hello.get("token", "")
    check("hello from the page's origin mints a token", s == 200 and len(token) >= 24 and hello.get("port") == PORT, str(s))
    s, h, _ = http("OPTIONS", "/v1/chat/completions", origin=PAGE)
    check("page origin preflight allows authorization and the tab headers", h.get("Access-Control-Allow-Origin") == PAGE and "authorization" in h.get("Access-Control-Allow-Headers", "") and "x-freeinference-tab" in h.get("Access-Control-Allow-Headers", ""), str(h))
    # Private Network Access: a public page's preflight that asks for the loopback is granted, so the
    # live HTTPS site can reach this relay; a hostile origin's is not.
    s, h, _ = http("OPTIONS", "/tab/hello", origin=PAGE, headers={"Access-Control-Request-Private-Network": "true"})
    check("preflight grants private network access to the page", h.get("Access-Control-Allow-Private-Network") == "true", str(h))
    s, h, _ = http("OPTIONS", "/tab/hello", origin=HOSTILE, headers={"Access-Control-Request-Private-Network": "true"})
    check("preflight denies private network access to a hostile origin", "Access-Control-Allow-Private-Network" not in h, str(h))
    # A client without a bearer is refused before anything else.
    s, _, raw = http("GET", "/v1/models")
    check("/v1/models without Authorization refused with 401", s == 401 and json.loads(raw)["error"]["type"] == "authentication_error", str(s))
    s, _, raw = http("POST", "/v1/chat/completions", {"messages": [{"role": "user", "content": "x"}]})
    check("/v1/chat/completions without Authorization refused with 401", s == 401, str(s))
    auth = {"Authorization": "Bearer local"}
    s, _, raw = http("GET", "/v1/models", headers=auth)
    check("/v1/models with a bearer and no tab is an empty list", s == 200 and json.loads(raw)["data"] == [], str(s))
    s, _, raw = http("POST", "/v1/chat/completions", {"messages": [{"role": "user", "content": "x"}]}, headers=auth)
    check("chat with no tab says open the page (503)", s == 503 and "open" in json.loads(raw)["error"]["message"], str(s))
    # A wrong token on /tab/next is refused.
    s, _, _ = http("GET", "/tab/next", headers={"X-Freeinference-Tab": "not-the-token", "X-Freeinference-Tab-Id": "zz"}, origin=PAGE)
    check("tab route with a wrong token refused", s == 403, str(s))
    # The tab attaches and serves.
    stop = threading.Event()
    t = threading.Thread(target=tab, args=("tabA1234", token, stop), daemon=True); t.start()
    time.sleep(0.5)
    s, _, raw = http("GET", "/v1/models", headers=auth)
    check("/v1/models comes from the tab", s == 200 and json.loads(raw)["data"][0]["id"] == "webgpu:Bonsai", str(s))
    s, h, raw = http("POST", "/v1/chat/completions", {"model": "webgpu:Bonsai", "messages": [{"role": "user", "content": "hello"}]}, headers=auth)
    body = json.loads(raw) if s == 200 else {}
    check("plain completion through the tab with its headers", s == 200 and body["choices"][0]["message"]["content"] == "echo: hello" and h.get("x-hologram-receipt") == "blake3:plain" and h.get("x-hologram-reuse") == "1", "%s %s" % (s, raw[:120]))
    s, h, frames = stream("POST", "/v1/chat/completions", {"model": "webgpu:Bonsai", "messages": [{"role": "user", "content": "hi"}], "stream": True}, auth)
    check("streamed completion: event stream, head headers, frames, [DONE]", s == 200 and h.get("Content-Type", "").startswith("text/event-stream") and h.get("x-hologram-receipt") == "blake3:stream" and len(frames) == 4 and frames[-1] == "[DONE]" and "echo: hi" in frames[1], "%s %s" % (s, frames))
    # A second tab is told who serves.
    s, _, raw = http("GET", "/tab/next", headers={"X-Freeinference-Tab": token, "X-Freeinference-Tab-Id": "tabB9999"}, origin=PAGE)
    check("a second tab gets 409 naming the serving tab", s == 409 and json.loads(raw).get("serving") == "tabA12", "%s %s" % (s, raw[:120]))
    s, _, raw = http("GET", "/tab/hello", headers={"X-Freeinference-Tab": "hello"}, origin=PAGE)
    check("hello names the serving tab", json.loads(raw).get("serving") == "tabA12", raw[:120])
    # The body cap.
    big = b'{"messages":[{"role":"user","content":"' + b"x" * 1_000_100 + b'"}]}'
    try:
        s, _, raw = http("POST", "/v1/chat/completions", big, headers=auth)
    except Exception as error:
        s, raw = str(error), b""
    check("a body above 1 MB is refused with 413", s == 413, str(s))
    # The log carries no content.
    stop.set()
finally:
    proc.terminate()
    try:
        out = proc.communicate(timeout=5)[0]
    except subprocess.TimeoutExpired:
        proc.kill(); out = proc.communicate()[0]
check("the relay log names no message content", "hello" not in out.replace("/tab/hello", "") and "echo:" not in out, out[-400:])
check("the relay said when the tab attached", "tab tabA12 attached" in out, out[-400:])

# Loopback only: any other host is refused before binding.
r = subprocess.run([sys.executable, str(RELAY)], env={**env, "FREEINFERENCE_RELAY_HOST": "0.0.0.0"}, capture_output=True, text=True, timeout=20)
check("binding any host but loopback is refused (exit 2)", r.returncode == 2 and "loopback" in r.stderr, "%s %s" % (r.returncode, r.stderr[:200]))

failed = [n for n, ok in checks if not ok]
print("relay: %d checks, %d failed" % (len(checks), len(failed)))
sys.exit(1 if failed else 0)
