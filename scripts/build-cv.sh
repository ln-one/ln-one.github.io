#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -x /opt/homebrew/opt/ruby/bin/ruby ]; then
  PATH="/opt/homebrew/opt/ruby/bin:$PATH"
  export PATH
fi
if ! command -v rendercv >/dev/null 2>&1; then
  echo "Install the CV builder first: uv tool install 'rendercv[full]==2.8'" >&2
  exit 1
fi
bundle exec ruby scripts/build-cv.rb
rendercv render output/pdf/Chunran_Zhang_CV.yaml --output-folder "$PWD/output/pdf"
mkdir -p papers
cp output/pdf/Chunran_Zhang_CV.pdf papers/Chunran_Zhang_CV.pdf
