
with open(r'c:\Users\Rkillz03\Downloads\vi-up (2)\vi-up\src\app\globals.css', 'r', encoding='utf-8') as f:
    lines = f.readlines()

stack = []
for i, line in enumerate(lines):
    line_num = i + 1
    for char in line:
        if char == '{':
            stack.append(line_num)
        elif char == '}':
            if not stack:
                print(f"Unmatched '}}' at line {line_num}")
            else:
                stack.pop()

if stack:
    print(f"Unclosed '{{' from lines: {stack}")
else:
    print("All braces matched.")
