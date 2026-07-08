import json
with open("frontend/package.json", "r") as f:
    data = json.load(f)
data["dependencies"]["axios"] = "^1.7.0"
data["dependencies"]["@tanstack/react-query"] = "^5.0.0"
data["dependencies"]["tailwindcss-animate"] = "^1.0.7"
data["dependencies"]["zustand"] = "^4.4.7"
with open("frontend/package.json", "w") as f:
    json.dump(data, f, indent=2)
print("OK")
