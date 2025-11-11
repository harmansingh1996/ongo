# 🚀 OnGoPool - Quick Local Setup

## 3-Step Local Deployment

### 1️⃣ Install & Build
```bash
npm install --legacy-peer-deps
npm run build
```

### 2️⃣ Install HTTP Server
```bash
npm install -g http-server
```

### 3️⃣ Run Locally
```bash
cd dist
http-server -p 3000 -o
```

**✅ Done!** Your app opens automatically at `http://localhost:3000`

---

## Alternative: One-Command Setup

If you prefer Python (built into macOS):
```bash
npm run build && cd dist && python3 -m http.server 3000
```

Then open: `http://localhost:3000`

---

## What You Get

- 🔐 **Complete Authentication System**
- 🚗 **Ride Posting & Finding**
- 💬 **Real-time Chat**
- 💰 **Payment Processing** (Test Mode)
- 📱 **Mobile Responsive**
- 📊 **Trip Management Dashboard**
- ⭐ **User Profiles & Ratings**

**Your carpool app is ready to use locally!** 🎉