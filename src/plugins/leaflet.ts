import * as L from 'leaflet'
import leafletCss from 'leaflet/dist/leaflet.css'
import leafletFullscreenCss from 'leaflet.fullscreen/Control.FullScreen.css'
import leafletDrawCss from 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet.fullscreen/Control.FullScreen.js'
import 'leaflet-draw/dist/leaflet.draw.js'
import { Term } from '@rdfjs/types'

import { Plugin, PluginOptions } from '../plugin'
import { Editor, fieldFactory } from '../theme'
import { ShaclPropertyTemplate } from '../property-template'
import { Geometry, geometryToWkt, wktToGeometry, worldBounds } from './map-util'

const css = `
#shaclMapDialog .closeButton { position: absolute; right: 0; top: 0; z-index: 1; padding: 6px 8px; cursor: pointer; border: 0; background-color: #FFFA; font-size: 24px; z-index: 1000; }
#shaclMapDialog { padding: 0; width:90vw; height: 90vh; margin: auto; }
#shaclMapDialog::backdrop { background-color: #0007; }
#shaclMapDialog .closeButton:hover { background-color: #FFF }
#shaclMapDialog .hint { position: absolute; right: 60px; top: 3px; z-index: 1; padding: 4px 6px; background-color: #FFFA; border-radius: 4px; z-index: 1000; pointer-events: none; }
.leaflet-container { min-height: 300px; }
.leaflet-draw-toolbar a { background-image: linear-gradient(transparent, transparent), url(data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+CjxzdmcKICAgeG1sbnM6ZGM9Imh0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvIgogICB4bWxuczpjYz0iaHR0cDovL2NyZWF0aXZlY29tbW9ucy5vcmcvbnMjIgogICB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiCiAgIHhtbG5zOnN2Zz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciCiAgIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICAgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiCiAgIHhtbG5zOnNvZGlwb2RpPSJodHRwOi8vc29kaXBvZGkuc291cmNlZm9yZ2UubmV0L0RURC9zb2RpcG9kaS0wLmR0ZCIKICAgeG1sbnM6aW5rc2NhcGU9Imh0dHA6Ly93d3cuaW5rc2NhcGUub3JnL25hbWVzcGFjZXMvaW5rc2NhcGUiCiAgIHZpZXdCb3g9IjAgMCA2MDAgNjAiCiAgIGhlaWdodD0iNjAiCiAgIHdpZHRoPSI2MDAiCiAgIGlkPSJzdmc0MjI1IgogICB2ZXJzaW9uPSIxLjEiCiAgIGlua3NjYXBlOnZlcnNpb249IjAuOTEgcjEzNzI1IgogICBzb2RpcG9kaTpkb2NuYW1lPSJzcHJpdGVzaGVldC5zdmciCiAgIGlua3NjYXBlOmV4cG9ydC1maWxlbmFtZT0iL2hvbWUvZnB1Z2EvZGV2ZWxvcG1lbnQvdXBzdHJlYW0vaWNhcnRvLkxlYWZsZXQuZHJhdy9zcmMvaW1hZ2VzL3Nwcml0ZXNoZWV0LTJ4LnBuZyIKICAgaW5rc2NhcGU6ZXhwb3J0LXhkcGk9IjkwIgogICBpbmtzY2FwZTpleHBvcnQteWRwaT0iOTAiPgogIDxtZXRhZGF0YQogICAgIGlkPSJtZXRhZGF0YTQyNTgiPgogICAgPHJkZjpSREY+CiAgICAgIDxjYzpXb3JrCiAgICAgICAgIHJkZjphYm91dD0iIj4KICAgICAgICA8ZGM6Zm9ybWF0PmltYWdlL3N2Zyt4bWw8L2RjOmZvcm1hdD4KICAgICAgICA8ZGM6dHlwZQogICAgICAgICAgIHJkZjpyZXNvdXJjZT0iaHR0cDovL3B1cmwub3JnL2RjL2RjbWl0eXBlL1N0aWxsSW1hZ2UiIC8+CiAgICAgICAgPGRjOnRpdGxlIC8+CiAgICAgIDwvY2M6V29yaz4KICAgIDwvcmRmOlJERj4KICA8L21ldGFkYXRhPgogIDxkZWZzCiAgICAgaWQ9ImRlZnM0MjU2IiAvPgogIDxzb2RpcG9kaTpuYW1lZHZpZXcKICAgICBwYWdlY29sb3I9IiNmZmZmZmYiCiAgICAgYm9yZGVyY29sb3I9IiM2NjY2NjYiCiAgICAgYm9yZGVyb3BhY2l0eT0iMSIKICAgICBvYmplY3R0b2xlcmFuY2U9IjEwIgogICAgIGdyaWR0b2xlcmFuY2U9IjEwIgogICAgIGd1aWRldG9sZXJhbmNlPSIxMCIKICAgICBpbmtzY2FwZTpwYWdlb3BhY2l0eT0iMCIKICAgICBpbmtzY2FwZTpwYWdlc2hhZG93PSIyIgogICAgIGlua3NjYXBlOndpbmRvdy13aWR0aD0iMTkyMCIKICAgICBpbmtzY2FwZTp3aW5kb3ctaGVpZ2h0PSIxMDU2IgogICAgIGlkPSJuYW1lZHZpZXc0MjU0IgogICAgIHNob3dncmlkPSJmYWxzZSIKICAgICBpbmtzY2FwZTp6b29tPSIxLjMxMDE4NTIiCiAgICAgaW5rc2NhcGU6Y3g9IjIzNy41NjkyOCIKICAgICBpbmtzY2FwZTpjeT0iNy4yNDE5NjIxIgogICAgIGlua3NjYXBlOndpbmRvdy14PSIxOTIwIgogICAgIGlua3NjYXBlOndpbmRvdy15PSIyNCIKICAgICBpbmtzY2FwZTp3aW5kb3ctbWF4aW1pemVkPSIxIgogICAgIGlua3NjYXBlOmN1cnJlbnQtbGF5ZXI9InN2ZzQyMjUiIC8+CiAgPGcKICAgICBpZD0iZW5hYmxlZCIKICAgICBzdHlsZT0iZmlsbDojNDY0NjQ2O2ZpbGwtb3BhY2l0eToxIj4KICAgIDxnCiAgICAgICBpZD0icG9seWxpbmUiCiAgICAgICBzdHlsZT0iZmlsbDojNDY0NjQ2O2ZpbGwtb3BhY2l0eToxIj4KICAgICAgPHBhdGgKICAgICAgICAgZD0ibSAxOCwzNiAwLDYgNiwwIDAsLTYgLTYsMCB6IG0gNCw0IC0yLDAgMCwtMiAyLDAgMCwyIHoiCiAgICAgICAgIGlkPSJwYXRoNDIyOSIKICAgICAgICAgaW5rc2NhcGU6Y29ubmVjdG9yLWN1cnZhdHVyZT0iMCIKICAgICAgICAgc3R5bGU9ImZpbGw6IzQ2NDY0NjtmaWxsLW9wYWNpdHk6MSIgLz4KICAgICAgPHBhdGgKICAgICAgICAgZD0ibSAzNiwxOCAwLDYgNiwwIDAsLTYgLTYsMCB6IG0gNCw0IC0yLDAgMCwtMiAyLDAgMCwyIHoiCiAgICAgICAgIGlkPSJwYXRoNDIzMSIKICAgICAgICAgaW5rc2NhcGU6Y29ubmVjdG9yLWN1cnZhdHVyZT0iMCIKICAgICAgICAgc3R5bGU9ImZpbGw6IzQ2NDY0NjtmaWxsLW9wYWNpdHk6MSIgLz4KICAgICAgPHBhdGgKICAgICAgICAgZD0ibSAyMy4xNDIsMzkuMTQ1IC0yLjI4NSwtMi4yOSAxNiwtMTUuOTk4IDIuMjg1LDIuMjg1IHoiCiAgICAgICAgIGlkPSJwYXRoNDIzMyIKICAgICAgICAgaW5rc2NhcGU6Y29ubmVjdG9yLWN1cnZhdHVyZT0iMCIKICAgICAgICAgc3R5bGU9ImZpbGw6IzQ2NDY0NjtmaWxsLW9wYWNpdHk6MSIgLz4KICAgIDwvZz4KICAgIDxwYXRoCiAgICAgICBpZD0icG9seWdvbiIKICAgICAgIGQ9Ik0gMTAwLDI0LjU2NSA5Ny45MDQsMzkuMzk1IDgzLjA3LDQyIDc2LDI4Ljc3MyA4Ni40NjMsMTggWiIKICAgICAgIGlua3NjYXBlOmNvbm5lY3Rvci1jdXJ2YXR1cmU9IjAiCiAgICAgICBzdHlsZT0iZmlsbDojNDY0NjQ2O2ZpbGwtb3BhY2l0eToxIiAvPgogICAgPHBhdGgKICAgICAgIGlkPSJyZWN0YW5nbGUiCiAgICAgICBkPSJtIDE0MCwyMCAyMCwwIDAsMjAgLTIwLDAgeiIKICAgICAgIGlua3NjYXBlOmNvbm5lY3Rvci1jdXJ2YXR1cmU9IjAiCiAgICAgICBzdHlsZT0iZmlsbDojNDY0NjQ2O2ZpbGwtb3BhY2l0eToxIiAvPgogICAgPHBhdGgKICAgICAgIGlkPSJjaXJjbGUiCiAgICAgICBkPSJtIDIyMSwzMCBjIDAsNi4wNzggLTQuOTI2LDExIC0xMSwxMSAtNi4wNzQsMCAtMTEsLTQuOTIyIC0xMSwtMTEgMCwtNi4wNzQgNC45MjYsLTExIDExLC0xMSA2LjA3NCwwIDExLDQuOTI2IDExLDExIHoiCiAgICAgICBpbmtzY2FwZTpjb25uZWN0b3ItY3VydmF0dXJlPSIwIgogICAgICAgc3R5bGU9ImZpbGw6IzQ2NDY0NjtmaWxsLW9wYWNpdHk6MSIgLz4KICAgIDxwYXRoCiAgICAgICBpZD0ibWFya2VyIgogICAgICAgZD0ibSAyNzAsMTkgYyAtNC45NzEsMCAtOSw0LjAyOSAtOSw5IDAsNC45NzEgNS4wMDEsMTIgOSwxNCA0LjAwMSwtMiA5LC05LjAyOSA5LC0xNCAwLC00Ljk3MSAtNC4wMjksLTkgLTksLTkgeiBtIDAsMTIuNSBjIC0yLjQ4NCwwIC00LjUsLTIuMDE0IC00LjUsLTQuNSAwLC0yLjQ4NCAyLjAxNiwtNC41IDQuNSwtNC41IDIuNDg1LDAgNC41LDIuMDE2IDQuNSw0LjUgMCwyLjQ4NiAtMi4wMTUsNC41IC00LjUsNC41IHoiCiAgICAgICBpbmtzY2FwZTpjb25uZWN0b3ItY3VydmF0dXJlPSIwIgogICAgICAgc3R5bGU9ImZpbGw6IzQ2NDY0NjtmaWxsLW9wYWNpdHk6MSIgLz4KICAgIDxnCiAgICAgICBpZD0iZWRpdCIKICAgICAgIHN0eWxlPSJmaWxsOiM0NjQ2NDY7ZmlsbC1vcGFjaXR5OjEiPgogICAgICA8cGF0aAogICAgICAgICBkPSJtIDMzNywzMC4xNTYgMCwwLjQwNyAwLDUuNjA0IGMgMCwxLjY1OCAtMS4zNDQsMyAtMywzIGwgLTEwLDAgYyAtMS42NTUsMCAtMywtMS4zNDIgLTMsLTMgbCAwLC0xMCBjIDAsLTEuNjU3IDEuMzQ1LC0zIDMsLTMgbCA2LjM0NSwwIDMuMTksLTMuMTcgLTkuNTM1LDAgYyAtMy4zMTMsMCAtNiwyLjY4NyAtNiw2IGwgMCwxMCBjIDAsMy4zMTMgMi42ODcsNiA2LDYgbCAxMCwwIGMgMy4zMTQsMCA2LC0yLjY4NyA2LC02IGwgMCwtOC44MDkgLTMsMi45NjgiCiAgICAgICAgIGlkPSJwYXRoNDI0MCIKICAgICAgICAgaW5rc2NhcGU6Y29ubmVjdG9yLWN1cnZhdHVyZT0iMCIKICAgICAgICAgc3R5bGU9ImZpbGw6IzQ2NDY0NjtmaWxsLW9wYWNpdHk6MSIgLz4KICAgICAgPHBhdGgKICAgICAgICAgZD0ibSAzMzguNzIsMjQuNjM3IC04Ljg5Miw4Ljg5MiAtMi44MjgsMCAwLC0yLjgyOSA4Ljg5LC04Ljg5IHoiCiAgICAgICAgIGlkPSJwYXRoNDI0MiIKICAgICAgICAgaW5rc2NhcGU6Y29ubmVjdG9yLWN1cnZhdHVyZT0iMCIKICAgICAgICAgc3R5bGU9ImZpbGw6IzQ2NDY0NjtmaWxsLW9wYWNpdHk6MSIgLz4KICAgICAgPHBhdGgKICAgICAgICAgZD0ibSAzMzguNjk3LDE3LjgyNiA0LDAgMCw0IC00LDAgeiIKICAgICAgICAgdHJhbnNmb3JtPSJtYXRyaXgoLTAuNzA2OTgzMzYsLTAuNzA3MjMwMTgsMC43MDcyMzAxOCwtMC43MDY5ODMzNiw1NjcuNTU5MTcsMjc0Ljc4MjczKSIKICAgICAgICAgaWQ9InBhdGg0MjQ0IgogICAgICAgICBpbmtzY2FwZTpjb25uZWN0b3ItY3VydmF0dXJlPSIwIgogICAgICAgICBzdHlsZT0iZmlsbDojNDY0NjQ2O2ZpbGwtb3BhY2l0eToxIiAvPgogICAgPC9nPgogICAgPGcKICAgICAgIGlkPSJyZW1vdmUiCiAgICAgICBzdHlsZT0iZmlsbDojNDY0NjQ2O2ZpbGwtb3BhY2l0eToxIj4KICAgICAgPHBhdGgKICAgICAgICAgZD0ibSAzODEsNDIgMTgsMCAwLC0xOCAtMTgsMCAwLDE4IHogbSAxNCwtMTYgMiwwIDAsMTQgLTIsMCAwLC0xNCB6IG0gLTQsMCAyLDAgMCwxNCAtMiwwIDAsLTE0IHogbSAtNCwwIDIsMCAwLDE0IC0yLDAgMCwtMTQgeiBtIC00LDAgMiwwIDAsMTQgLTIsMCAwLC0xNCB6IgogICAgICAgICBpZD0icGF0aDQyNDciCiAgICAgICAgIGlua3NjYXBlOmNvbm5lY3Rvci1jdXJ2YXR1cmU9IjAiCiAgICAgICAgIHN0eWxlPSJmaWxsOiM0NjQ2NDY7ZmlsbC1vcGFjaXR5OjEiIC8+CiAgICAgIDxwYXRoCiAgICAgICAgIGQ9Im0gMzk1LDIwIDAsLTQgLTEwLDAgMCw0IC02LDAgMCwyIDIyLDAgMCwtMiAtNiwwIHogbSAtMiwwIC02LDAgMCwtMiA2LDAgMCwyIHoiCiAgICAgICAgIGlkPSJwYXRoNDI0OSIKICAgICAgICAgaW5rc2NhcGU6Y29ubmVjdG9yLWN1cnZhdHVyZT0iMCIKICAgICAgICAgc3R5bGU9ImZpbGw6IzQ2NDY0NjtmaWxsLW9wYWNpdHk6MSIgLz4KICAgIDwvZz4KICA8L2c+CiAgPGcKICAgICBpZD0iZGlzYWJsZWQiCiAgICAgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTIwLDApIgogICAgIHN0eWxlPSJmaWxsOiNiYmJiYmIiPgogICAgPHVzZQogICAgICAgeGxpbms6aHJlZj0iI2VkaXQiCiAgICAgICBpZD0iZWRpdC1kaXNhYmxlZCIKICAgICAgIHg9IjAiCiAgICAgICB5PSIwIgogICAgICAgd2lkdGg9IjEwMCUiCiAgICAgICBoZWlnaHQ9IjEwMCUiIC8+CiAgICA8dXNlCiAgICAgICB4bGluazpocmVmPSIjcmVtb3ZlIgogICAgICAgaWQ9InJlbW92ZS1kaXNhYmxlZCIKICAgICAgIHg9IjAiCiAgICAgICB5PSIwIgogICAgICAgd2lkdGg9IjEwMCUiCiAgICAgICBoZWlnaHQ9IjEwMCUiIC8+CiAgPC9nPgogIDxwYXRoCiAgICAgc3R5bGU9ImZpbGw6bm9uZTtzdHJva2U6IzQ2NDY0NjtzdHJva2Utd2lkdGg6MjtzdHJva2UtbWl0ZXJsaW1pdDo0O3N0cm9rZS1kYXNoYXJyYXk6bm9uZTtzdHJva2Utb3BhY2l0eToxIgogICAgIGlkPSJjaXJjbGUtMyIKICAgICBkPSJtIDU4MS42NTcyNSwzMCBjIDAsNi4wNzggLTQuOTI2LDExIC0xMSwxMSAtNi4wNzQsMCAtMTEsLTQuOTIyIC0xMSwtMTEgMCwtNi4wNzQgNC45MjYsLTExIDExLC0xMSA2LjA3NCwwIDExLDQuOTI2IDExLDExIHoiCiAgICAgaW5rc2NhcGU6Y29ubmVjdG9yLWN1cnZhdHVyZT0iMCIgLz4KPC9zdmc+Cg==); }
.fullscreen-icon { background-image: url(data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjYgNTIiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTIwLjYgMzYuN0gxNmEuOS45IDAgMCAxLS44LS44di00LjVjMC0uMi4yLS40LjQtLjRoMS40Yy4zIDAgLjUuMi41LjR2M2gzYy4yIDAgLjQuMi40LjV2MS40YzAgLjItLjIuNC0uNC40em0tOS45LS44di00LjVjMC0uMi0uMi0uNC0uNC0uNEg4LjljLS4zIDAtLjUuMi0uNS40djNoLTNjLS4yIDAtLjQuMi0uNC41djEuNGMwIC4yLjIuNC40LjRIMTBjLjQgMCAuOC0uNC44LS44em0wIDEwLjdWNDJjMC0uNC0uNC0uOC0uOC0uOEg1LjRjLS4yIDAtLjQuMi0uNC40djEuNGMwIC4zLjIuNS40LjVoM3YzYzAgLjIuMi40LjUuNGgxLjRjLjIgMCAuNC0uMi40LS40em02LjkgMHYtM2gzYy4yIDAgLjQtLjIuNC0uNXYtMS40YzAtLjItLjItLjQtLjQtLjRIMTZjLS40IDAtLjguNC0uOC44djQuNWMwIC4yLjIuNC40LjRoMS40Yy4zIDAgLjUtLjIuNS0uNHpNNSAxMC4zVjUuOWMwLS41LjQtLjkuOS0uOWg0LjRjLjIgMCAuNC4yLjQuNFY3YzAgLjItLjIuNC0uNC40aC0zdjNjMCAuMi0uMi40LS40LjRINS40YS40LjQgMCAwIDEtLjQtLjR6bTEwLjMtNC45VjdjMCAuMi4yLjQuNC40aDN2M2MwIC4yLjIuNC40LjRoMS41Yy4yIDAgLjQtLjIuNC0uNFY1LjljMC0uNS0uNC0uOS0uOS0uOWgtNC40Yy0uMiAwLS40LjItLjQuNHptNS4zIDkuOUgxOWMtLjIgMC0uNC4yLS40LjR2M2gtM2MtLjIgMC0uNC4yLS40LjR2MS41YzAgLjIuMi40LjQuNGg0LjRjLjUgMCAuOS0uNC45LS45di00LjRjMC0uMi0uMi0uNC0uNC0uNHptLTkuOSA1LjNWMTljMC0uMi0uMi0uNC0uNC0uNGgtM3YtM2MwLS4yLS4yLS40LS40LS40SDUuNGMtLjIgMC0uNC4yLS40LjR2NC40YzAgLjUuNC45LjkuOWg0LjRjLjIgMCAuNC0uMi40LS40eiIgZmlsbD0iY3VycmVudENvbG9yIi8+PC9zdmc+); }
.leaflet-marker-icon { margin: -1px; font-size: 0; background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAApCAYAAADAk4LOAAAFgUlEQVR4Aa1XA5BjWRTN2oW17d3YaZtr2962HUzbDNpjszW24mRt28p47v7zq/bXZtrp/lWnXr337j3nPCe85NcypgSFdugCpW5YoDAMRaIMqRi6aKq5E3YqDQO3qAwjVWrD8Ncq/RBpykd8oZUb/kaJutow8r1aP9II0WmLKLIsJyv1w/kqw9Ch2MYdB++12Onxee/QMwvf4/Dk/Lfp/i4nxTXtOoQ4pW5Aj7wpici1A9erdAN2OH64x8OSP9j3Ft3b7aWkTg/Fm91siTra0f9on5sQr9INejH6CUUUpavjFNq1B+Oadhxmnfa8RfEmN8VNAsQhPqF55xHkMzz3jSmChWU6f7/XZKNH+9+hBLOHYozuKQPxyMPUKkrX/K0uWnfFaJGS1QPRtZsOPtr3NsW0uyh6NNCOkU3Yz+bXbT3I8G3xE5EXLXtCXbbqwCO9zPQYPRTZ5vIDXD7U+w7rFDEoUUf7ibHIR4y6bLVPXrz8JVZEql13trxwue/uDivd3fkWRbS6/IA2bID4uk0UpF1N8qLlbBlXs4Ee7HLTfV1j54APvODnSfOWBqtKVvjgLKzF5YdEk5ewRkGlK0i33Eofffc7HT56jD7/6U+qH3Cx7SBLNntH5YIPvODnyfIXZYRVDPqgHtLs5ABHD3YzLuespb7t79FY34DjMwrVrcTuwlT55YMPvOBnRrJ4VXTdNnYug5ucHLBjEpt30701A3Ts+HEa73u6dT3FNWwflY86eMHPk+Yu+i6pzUpRrW7SNDg5JHR4KapmM5Wv2E8Tfcb1HoqqHMHU+uWDD7zg54mz5/2BSnizi9T1Dg4QQXLToGNCkb6tb1NU+QAlGr1++eADrzhn/u8Q2YZhQVlZ5+CAOtqfbhmaUCS1ezNFVm2imDbPmPng5wmz+gwh+oHDce0eUtQ6OGDIyR0uUhUsoO3vfDmmgOezH0mZN59x7MBi++WDL1g/eEiU3avlidO671bkLfwbw5XV2P8Pzo0ydy4t2/0eu33xYSOMOD8hTf4CrBtGMSoXfPLchX+J0ruSePw3LZeK0juPJbYzrhkH0io7B3k164hiGvawhOKMLkrQLyVpZg8rHFW7E2uHOL888IBPlNZ1FPzstSJM694fWr6RwpvcJK60+0HCILTBzZLFNdtAzJaohze60T8qBzyh5ZuOg5e7uwQppofEmf2++DYvmySqGBuKaicF1blQjhuHdvCIMvp8whTTfZzI7RldpwtSzL+F1+wkdZ2TBOW2gIF88PBTzD/gpeREAMEbxnJcaJHNHrpzji0gQCS6hdkEeYt9DF/2qPcEC8RM28Hwmr3sdNyht00byAut2k3gufWNtgtOEOFGUwcXWNDbdNbpgBGxEvKkOQsxivJx33iow0Vw5S6SVTrpVq11ysA2Rp7gTfPfktc6zhtXBBC+adRLshf6sG2RfHPZ5EAc4sVZ83yCN00Fk/4kggu40ZTvIEm5g24qtU4KjBrx/BTTH8ifVASAG7gKrnWxJDcU7x8X6Ecczhm3o6YicvsLXWfh3Ch1W0k8x0nXF+0fFxgt4phz8QvypiwCCFKMqXCnqXExjq10beH+UUA7+nG6mdG/Pu0f3LgFcGrl2s0kNNjpmoJ9o4B29CMO8dMT4Q5ox8uitF6fqsrJOr8qnwNbRzv6hSnG5wP+64C7h9lp30hKNtKdWjtdkbuPA19nJ7Tz3zR/ibgARbhb4AlhavcBebmTHcFl2fvYEnW0ox9xMxKBS8btJ+KiEbq9zA4RthQXDhPa0T9TEe69gWupwc6uBUphquXgf+/FrIjweHQS4/pduMe5ERUMHUd9xv8ZR98CxkS4F2n3EUrUZ10EYNw7BWm9x1GiPssi3GgiGRDKWRYZfXlON+dfNbM+GgIwYdwAAAAASUVORK5CYII=); }
.leaflet-marker-shadow { display: none; }
#shaclMapDialogContainer { width:100%; height: 100%; }
`
const dialogTemplate = `
<dialog id="shaclMapDialog" onclick="event.target==this && this.close()">
<div id="shaclMapDialogContainer"></div>
<div class="hint">&#x24D8; Draw a polygon or point, then close dialog</div>
<button class="closeButton" type="button" onclick="this.parentElement.close()">&#x2715;</button>
</dialog>`

export class LeafletPlugin extends Plugin {
    map: L.Map | undefined
    drawLayer: L.FeatureGroup | undefined
    currentEditor: Editor | undefined

    constructor(options: PluginOptions) {
        super(options, leafletCss + '\n' + leafletFullscreenCss + '\n' + leafletDrawCss + '\n' + css)
    }

    initEditMode(form: HTMLElement): HTMLDialogElement {
        form.insertAdjacentHTML('beforeend', dialogTemplate)
        const container = form.querySelector('#shaclMapDialogContainer') as HTMLElement
        this.map = L.map(container, {
            attributionControl: false,
            fullscreenControl: true,
            layers: [
                L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png'),
                // L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'),
            ],
            zoom: 5,
            maxBounds: worldBounds,
            center: { lng: 8.657238961696038, lat: 49.87627570549512 }
        })

        this.drawLayer = L.featureGroup().addTo(this.map)
        this.map.addControl(new L.Control.Draw({
            edit: {
                featureGroup: this.drawLayer,
                edit: false,
                remove: false
            },
            draw: {
                polygon: { allowIntersection: false },
                rectangle: false,
                polyline: false,
                circlemarker: false,
                circle: false
            }
        }))
    
        this.map.on(L.Draw.Event.DRAWSTART, () => {
            this.drawLayer?.clearLayers()
        })
        this.map.on(L.Draw.Event.CREATED, (event) => {
            this.drawLayer?.addLayer(event.layer)
        })

        const dialog = form.querySelector('#shaclMapDialog') as HTMLDialogElement
        dialog.addEventListener('close', () => {
            const scrollY = document.body.style.top
            document.body.style.position = ''
            document.body.style.top = ''
            window.scrollTo(0, parseInt(scrollY || '0') * -1)
            // set wkt in editor
            const features = this.drawLayer?.getLayers()
            if (features?.length && this.currentEditor) {
                let geometry: Geometry | undefined
                //@ts-ignore
                if (features[0].editing?.latlngs?.length) {
                    //@ts-ignore
                    geometry = { type: 'Polygon', coordinates: [features[0].editing?.latlngs[0][0].map((pos) => { return [ pos.lng, pos.lat ] })] }
                //@ts-ignore
                } else if (features[0].editing?._marker?._latlng) {
                    //@ts-ignore
                    const pos = features[0].editing?._marker?._latlng
                    geometry = { type: 'Point', coordinates: [pos.lng, pos.lat] }
                }
                if (geometry) {
                    const wkt = geometryToWkt(geometry)
                    this.currentEditor.value = wkt
                    this.currentEditor.dispatchEvent(new Event('change', { bubbles: true }))
                }
            }
        })
        return dialog
    }

    createEditor(template: ShaclPropertyTemplate, value?: Term): HTMLElement {
        let dialog = template.config.form.querySelector('#shaclMapDialog') as HTMLDialogElement
        if (!dialog) {
            dialog = this.initEditMode(template.config.form)
        }
        const button = template.config.theme.createButton('Open&#160;map...', false)
        button.style.marginLeft = '5px'
        button.classList.add('open-map-button')
        button.onclick = () => {
            this.currentEditor = instance.querySelector('.editor') as Editor
            this.drawLayer?.clearLayers()
            const wkt = this.currentEditor.value || ''
            const geometry = wktToGeometry(wkt)
            this.drawAndZoomToGeometry(geometry, this.drawLayer!, this.map!)

            document.body.style.top = `-${window.scrollY}px`
            document.body.style.position = 'fixed'
            dialog.showModal()
            setTimeout(() => { this.map?.invalidateSize()})
        }
        const instance = fieldFactory(template, value || null)
        instance.appendChild(button)
        return instance
    }

    createViewer(template: ShaclPropertyTemplate, value: Term): HTMLElement {
        const container = document.createElement('div')
        const geometry = wktToGeometry(value.value)
        if (geometry?.coordinates?.length) {
            // wait for container to be available in DOM
            setTimeout(() => {
                const map = L.map(container, {
                    attributionControl: false,
                    fullscreenControl: true,
                    layers: [
                        L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png'),
                        // L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'),
                    ],
                    zoom: 5,
                    maxBounds: worldBounds
                })
                const drawLayer = L.featureGroup().addTo(map)
                this.drawAndZoomToGeometry(geometry, drawLayer, map)
            })
        }
        return container
    }

    drawAndZoomToGeometry(geometry: Geometry | undefined, drawLayer: L.LayerGroup, map: L.Map) {
        if (geometry?.type === 'Point') {
            const coords = { lng: geometry.coordinates[0], lat: geometry.coordinates[1] }
            L.marker(coords).addTo(drawLayer)
            map.setView(coords, 15, { animate: false })

        } else if (geometry?.type === 'Polygon') {
            const polygon =  L.polygon(geometry.coordinates[0].map((pos) => { return { lng: pos[0], lat: pos[1] }})).addTo(drawLayer!)
            setTimeout(() => { map.fitBounds(polygon.getBounds(), { animate: false }) }, 100)
        } else {
            map.setZoom(5)
        }
    }
}