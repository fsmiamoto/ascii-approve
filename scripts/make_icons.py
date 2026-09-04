import struct, zlib, sys

# 16x16 pixel design: dark rounded tile with green check-mark, "approve" vibe.
GRID = [
"................",
".##############.",
"################",
"################",
"################",
"############GG##",
"###########GG###",
"##########GG####",
"###GG####GG#####",
"####GG##GG######",
"#####GGGG#######",
"######GG########",
"################",
"################",
"################",
".##############.",
]
COL = {"#": (31, 35, 40, 255), "G": (63, 185, 80, 255), ".": (0, 0, 0, 0)}

def png(size):
    scale = size // 16
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            r, g, b, a = COL[GRID[y // scale][x // scale]]
            row += bytes((r, g, b, a))
        rows.append(bytes(row))
    raw = b"".join(rows)
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))

for s in (16, 48, 128):
    open(f"icons/icon{s}.png", "wb").write(png(s))
print("icons ok")
