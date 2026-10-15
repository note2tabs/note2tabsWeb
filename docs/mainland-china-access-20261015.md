# Mainland China reachability probes — 15 October 2026

Public HTTP GET probes using Check-Host.cc: Hohhot, mainland China (Alibaba Cloud AS37963), and Nuremberg, Germany control. One datacenter node per region. This is network reachability, not a residential/mobile browser or end-to-end transcription test. No customer credentials, uploads, payments or private URLs were submitted.

| Target | Hohhot status / reported time | Germany status / reported time | Evidence |
| --- | --- | --- | --- |
| https://www.note2tabs.com/zh-hans/ | 200 / 1430 ms | 200 / 375 ms | [Report](https://check-host.cc/report/b3915317-2bf5-41fe-924c-9f1430d9dadc) |
| https://www.note2tabs.com/_next/static/chunks/0a20p2xsgsfh7.js | 200 / 315 ms | 200 / 45 ms | [Report](https://check-host.cc/report/8ea5305f-f172-466a-a7fa-6254e567c9ba) |
| https://www.note2tabs.com/zh-hans/transcribe | 200 / 612 ms | 200 / 204 ms | [Report](https://check-host.cc/report/37cc727d-ed35-42a8-9eab-02c7695032c4) |
| https://www.note2tabs.com/zh-hans/auth/login | 200 / 624 ms | 200 / 161 ms | [Report](https://check-host.cc/report/17d74ba8-281f-4aae-a601-58febe67db59) |
| https://www.note2tabs.com/api/auth/providers | 200 / 575 ms | 200 / 172 ms | [Report](https://check-host.cc/report/13ae1daa-f43b-493c-be66-db5ee8558fdd) |
| https://www.note2tabs.com/api/transcribe | 405 / 379 ms | 405 / 221 ms | [Report](https://check-host.cc/report/b3cb35d5-2b87-4010-893c-ecfbb61cb52b) |
| https://accounts.google.com/.well-known/openid-configuration | 0 / 15000 ms | 200 / 49 ms | [Report](https://check-host.cc/report/fa5f6021-98c6-491d-8b5e-04caeffc1dd5) |

The app homepage, sampled JS chunk, Chinese transcriber/login pages and auth-provider endpoint returned HTTP 200 in both regions. GET /api/transcribe returned the expected 405 (the endpoint requires POST); this confirms route reachability, not that an authenticated job can run. Google accounts discovery returned no HTTP response within the 15-second Hohhot timeout, while Germany returned 200 in 49 ms. This is evidence of a Google-account dependency problem on this tested route at this time, not proof all Chinese carriers or all OAuth requests fail.

Still untested: browser hydration and every asset, OAuth interaction, email verification/delivery, signed object-storage upload/CORS, an authenticated transcription and playback. A real mainland browser/user session is required to establish those. Hong Kong is not a mainland substitute. No paid testing service was purchased.

Provider API documentation: https://check-host.cc/docs
