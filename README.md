# Dartboard Connector

[![CI](https://github.com/minimalcorp/dartboard-connector/actions/workflows/ci.yaml/badge.svg?branch=main)](https://github.com/minimalcorp/dartboard-connector/actions/workflows/ci.yaml)

## Packages

- [Dartboard Connector](./packages/dartboard-connector/README.md)

## Examples

example implementation is under `./example` directory.

Get-Process | Where-Object { $_.ProcessName -match 'darts|room|electron' -or $_.MainWindowTitle -match 'darts|room' } | Select-Object ProcessName,Path,MainWindowTitle | Format-List
