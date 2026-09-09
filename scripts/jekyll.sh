#!/bin/sh
set -eu
if [ -x /opt/homebrew/opt/ruby/bin/ruby ]; then
  PATH="/opt/homebrew/opt/ruby/bin:$PATH"
  export PATH
fi
exec bundle exec jekyll "$@"
