# Dartboard Connector

[![CI](https://github.com/minimalcorp/dartboard-connector/actions/workflows/ci.yaml/badge.svg?branch=main)](https://github.com/minimalcorp/dartboard-connector/actions/workflows/ci.yaml)

## Packages

- [Dartboard Connector](./packages/dartboard-connector/README.md)

## Examples

example implementation is under `./example` directory.
(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like '*Darts Room*' } | Select-Object -First 1 -ExpandProperty ExecutablePath)
