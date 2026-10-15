#!/usr/bin/env python
"""Fix logging hygiene in main.py"""
import os

script_dir = os.path.join(os.getcwd(), "dailybot", "bot")
main_py = os.path.join(script_dir, "main.py")

with open(main_py, "r") as f:
    content = f.read()

# Add log hygiene after the import block
old_block = """import logging
import os
import json
from datetime import datetime
from zoneinfo import ZoneInfo"""

new_block = """import logging
import os
import json
from datetime import datetime
from zoneinfo import ZoneInfo

# Prevent token leakage in HTTP client logs
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)"""

if old_block in content:
    content = content.replace(old_block, new_block)
    with open(main_py, "w") as f:
        f.write(content)
    print("SUCCESS: Log hygiene directives added to main.py")
else:
    print("ERROR: Could not find import block to replace")
    print("First 200 chars:", repr(content[:200]))
"