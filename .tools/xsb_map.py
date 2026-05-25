"""Parse XACT Sound Bank using MonoGame's known layout (XACT3 v46).

Format derived from MonoGame's SoundBank.cs:
  https://github.com/MonoGame/MonoGame/blob/develop/MonoGame.Framework/Audio/Xact/SoundBank.cs
"""
import struct, sys, json

xsb = sys.argv[1] if len(sys.argv) > 1 else r"D:\stardew valley\Stardew Valley\Content\XACT\Sound Bank.xsb"
data = open(xsb, "rb").read()
assert data[:4] == b"SDBK"

# offsets per MonoGame
def u8(o): return data[o]
def u16(o): return struct.unpack_from("<H", data, o)[0]
def u32(o): return struct.unpack_from("<I", data, o)[0]

magic = data[:4]
toolVersion = u16(4)
formatVersion = u16(6)
crc = u16(8)
lastModifiedLow = u32(10)
lastModifiedHigh = u32(14)
platform = u8(18)
numSimpleCues = u16(19)
numComplexCues = u16(21)
unkn = u16(23)
numTotalCues = u16(25)
numWaveBanks = u8(27)
numSounds = u16(28)
cueNameTableLen = u16(30)
unknown = u16(32)
simpleCuesOffset = u32(34)
complexCuesOffset = u32(38)
cueNamesOffset = u32(42)
unkOffset1 = u32(46)
unkOffset2 = u32(50)
waveBankNameTableOffset = u32(54)
cueNameHashTableOffset = u32(58)
cueNameHashValsOffset = u32(62)
soundsOffset = u32(66)

# In MonoGame the sound entries are written contiguously starting at soundsOffset,
# and references by sound_index point directly to file offsets, not to a table.
# Sanity-check: print sample bytes
print("sample @ soundsOffset:", data[soundsOffset:soundsOffset+12].hex(), file=sys.stderr)
print("file size:", len(data), file=sys.stderr)

print(f"tool={toolVersion} format={formatVersion} simple={numSimpleCues} complex={numComplexCues} total={numTotalCues} sounds={numSounds} waveBanks={numWaveBanks}", file=sys.stderr)

# Cue names: null-terminated ASCII at cueNamesOffset, length cueNameTableLen
name_block = data[cueNamesOffset:cueNamesOffset + cueNameTableLen]
cue_names = name_block.split(b"\x00")
cue_names = [n.decode("ascii", "replace") for n in cue_names if n]
print(f"cue_names parsed: {len(cue_names)}", file=sys.stderr)

# Sound entries (by offset table at soundsOffset)
def parse_sound_entry(off):
    flags = data[off]
    isComplex = bool(flags & 0x01)
    hasRpc = bool(flags & 0x0E)
    hasDsp = bool(flags & 0x10)
    p = off + 1
    p += 2  # category
    p += 1  # vol
    p += 2  # pitch
    p += 1  # priority
    p += 2  # filter
    if hasRpc:
        rpcLen = u16(p); p += rpcLen
    if hasDsp:
        dspLen = u16(p); p += dspLen
    if not isComplex:
        track = u16(p)
        wb = data[p + 2]
        return {"complex": False, "wave_bank": wb, "track": track}
    return {"complex": True}


# Build cue index → sound offset.
# Simple cues table: numSimpleCues × 3 bytes? MonoGame says simple_cue at simpleCuesOffset:
# struct simpleCue { byte flags; uint16 sound_index; }  -- 3 bytes
mapping = {}
simple_cue_size = 3
# In MonoGame the simple cue stores a *direct file offset* to the sound entry,
# not an index into a sound table. The struct is uint32 sound_offset.
simple_cue_size = 4
for i in range(numSimpleCues):
    base = simpleCuesOffset + i * simple_cue_size
    if base + simple_cue_size > len(data): break
    soff = u32(base)
    name = cue_names[i] if i < len(cue_names) else f"cue_{i}"
    if soff >= len(data):
        continue
    info = parse_sound_entry(soff)
    if not info["complex"]:
        mapping[name] = info

print(json.dumps(mapping, indent=2))
