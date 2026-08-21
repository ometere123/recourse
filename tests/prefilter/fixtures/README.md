# Captured authority fixtures

These public-source captures make the full deterministic prefilter suite reproducible offline.

| File | Contract endpoint | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `SDN.CSV` | `https://sanctionslistservice.ofac.treas.gov/api/download/sdn.csv` | 5,647,099 | `369c3ad9ceefed9ca82f4c45484b731c93687282c36ea3f512543d2c61b85c6b` |
| `ALT.CSV` | `https://sanctionslistservice.ofac.treas.gov/api/download/alt.csv` | 1,063,617 | `c00af65765e4435ef759f9992291093e47ef5a938a145ed381c6dbf2b2f422bc` |
| `consolidated.xml` | `https://scsanctions.un.org/resources/xml/en/consolidated.xml` | 2,176,185 | `0f0ac1ea30415bcd472aa92a4574eb3011c3c423ca6dfc5802ca4d5f25ebbced` |

They are test inputs only. The runtime contract always fetches the current authority endpoints in validator consensus. Hashes pin exactly what the offline corpus assertions describe; a future refresh must update both fixture bytes and measured expectations deliberately.
