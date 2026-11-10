"""Production entry point: `python -m app.serve`.

`uvicorn --host ::` is IPv6-only (asyncio sets IPV6_V6ONLY), while Railway's
private network may hand the app an IPv4 address for `dxf-checker.railway.internal`.
One dual-stack socket takes both.
"""
from __future__ import annotations

import os
import socket

import uvicorn


def dual_stack_socket(port: int) -> socket.socket:
    sock = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
    sock.bind(("::", port))
    sock.set_inheritable(True)
    return sock


def main() -> None:
    port = int(os.environ.get("PORT", "8080"))
    config = uvicorn.Config("app.main:create_app", factory=True, access_log=False, log_level="info")
    uvicorn.Server(config).run(sockets=[dual_stack_socket(port)])


if __name__ == "__main__":
    main()
