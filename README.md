# Green SPOT Auction Portal ⚡️

A high-performance, three-stage energy trading terminal designed for **Day-Ahead** and **Intraday** renewable energy auctions. 

Built as a technical demonstration for **Otark**, this portal focuses on reducing "Time-to-Trade" and eliminating "Fat-Finger" errors in high-pressure, time-sensitive market environments.

---

## 🚀 Key Architectural Decisions

### 1. The "Safety-First" 3-Stage Workflow
Unlike a standard "spreadsheet" interface, this portal uses a linear state machine to ensure data integrity and user focus:
* **Setup:** Establishes market context (Day-Ahead vs. Intraday) and highlights the **11:00 CET Gate Closure** deadline—the "North Star" of the energy trader's morning.
* **Bid Entry:** A high-efficiency workspace with "Sticky" controls and real-time validation. 
* **Review:** A read-only "Financial Exposure" summary designed to act as a final audit before committing bids to the exchange.

### 2. Market-Aware Intelligence
The portal isn't just a data entry tool; it’s a trading assistant. It features a **Deterministic Pricing Engine** that simulates the German energy market's "Solar Dip" and "Evening Peak," providing traders with a realistic reference point (`REF €`) for their bids.

### 3. "Zero-Friction" UX Patterns
* **Automatic Row Activation:** Bids activate instantly as you type—no redundant checkboxes.
* **Smart Sync Presets:** "Sync All Prices" and "Sync Peak" buttons allow users to align their entire strategy with market forecasts in a single click.
* **Floating Bulk Actions:** Context-aware controls appear only when rows are selected, allowing for rapid volume and price adjustments across multiple slots.

---

## 🏗 Tech Stack

* **Framework:** React 18
* **Styling:** Tailwind CSS (Atomic Design approach)
* **Icons:** Lucide React
* **State Management:** Local React State with persistent caching between workflow steps.
* **Mock Engine:** Custom `pricing.ts` utility for market simulation.

---

## 📈 Industry-Specific Features

* **Gate Closure Awareness:** A countdown timer that turns yellow within 30 minutes of the 11:00 CET deadline.
* **Financial Guardrails:** Real-time calculation of **Total Volume (MWh)** and **Est. Max Spend (€)**.
* **Visual Scannability:** Hourly rows are grouped into "Night, Morning, Day, Evening" blocks to help traders visualize their load shape at a glance.

---

## ⚙️ Installation & Setup

1.  **Clone the repo:**
    ```bash
    git clone [https://github.com/AleKoles/gs.git](https://github.com/AleKoles/gs.git)
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Run the development server:**
    ```bash
    npm run dev
    ```

---
