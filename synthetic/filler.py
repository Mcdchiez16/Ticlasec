"""Template-generated pages that pad each built-in scenario to :data:`TARGET_PAGES`.

The hand-written pages in :mod:`synthetic.scenarios` carry the story: the shared
handles, wallets and infrastructure that make the relationship graph interesting.
The pages built here widen the corpus around that story so a synthetic
investigation works through a realistic volume of material (victim listings,
forum replies, indicator dumps, channel digests, advisories, vendor listings)
without changing the hand-written pages or their identifiers.

Everything is deterministic: the caller passes the scenario's seeded
:class:`random.Random`, already advanced past the hand-written identifiers, so
the story pages keep the same values they always had and the filler is the same
on every run. All names are invented; the places are real Zambian towns so the
intelligence-scope scoring recognises the pages as locally relevant.
"""

from __future__ import annotations

import random
from typing import Callable

from . import generator as g

TARGET_PAGES = 50

TOWNS = (
    "Lusaka", "Ndola", "Kitwe", "Livingstone", "Chingola", "Kabwe", "Solwezi",
    "Mufulira", "Chipata", "Mazabuka", "Choma", "Mongu", "Kasama", "Luanshya",
)

# (company, sector, town) — all invented organisations.
COMPANIES = (
    ("Nkana Agro Supplies Ltd", "agricultural inputs", "Kitwe"),
    ("Zambezi Sun Hotels Group", "hospitality", "Livingstone"),
    ("Kabwe Cement Works", "construction materials", "Kabwe"),
    ("Luangwa Microfinance", "microfinance", "Chipata"),
    ("Chingola Copper Services", "mining services", "Chingola"),
    ("Mosi Transport & Haulage", "road freight", "Lusaka"),
    ("Solwezi Mining Supplies", "mining supplies", "Solwezi"),
    ("Kariba Power Contractors", "electrical contracting", "Lusaka"),
    ("Mongu Rice Cooperative", "agriculture", "Mongu"),
    ("Lusaka Private Schools Trust", "education", "Lusaka"),
    ("Mazabuka Sugar Logistics", "logistics", "Mazabuka"),
    ("Choma Dairy Products", "food processing", "Choma"),
    ("Ndola Medical Supplies", "healthcare distribution", "Ndola"),
    ("Copperbelt Motor Dealers", "vehicle sales", "Ndola"),
    ("Kasama Timber Holdings", "forestry", "Kasama"),
    ("Luanshya Water Utility", "water utility", "Luanshya"),
    ("Mufulira Engineering Works", "engineering", "Mufulira"),
    ("Chipata Cotton Ginners", "agro-processing", "Chipata"),
    ("Lusaka Legal Chambers", "legal services", "Lusaka"),
    ("Kitwe Technical College", "education", "Kitwe"),
)

HANDLES = (
    "Z3dNet_Watch", "ByteKwacha", "N0rthRig", "CopperShade", "L1vingst0ne_x",
    "MweneOps", "K4bwe_Sec", "Tumbuka_Ghost", "SolwezyNode", "Kafue_Drift",
    "Bemba_Byte", "ChipataLogs", "Zed_Reaper", "NkanaRoot", "MosiTide",
)

Template = Callable[[random.Random, int], tuple[str, str, str, str]]


def _kwacha(rng: random.Random, low: int, high: int) -> str:
    return f"K{rng.randint(low, high) * 1000:,}"


def expand(rng: random.Random, templates: list[Template], existing: int, target: int = TARGET_PAGES) -> list[tuple[str, str, str, str]]:
    """Return ``(host, path, title, text)`` tuples until ``existing + len(result) == target``.

    Templates are used round-robin so every page kind is represented, and each
    template receives its own running counter so paths stay unique.
    """
    needed = max(0, target - existing)
    counters = [0] * len(templates)
    out: list[tuple[str, str, str, str]] = []
    for index in range(needed):
        slot = index % len(templates)
        counters[slot] += 1
        out.append(templates[slot](rng, counters[slot]))
    return out


# ── 1. Ransomware ────────────────────────────────────────────────────────────


def ransomware_templates(rng: random.Random, *, leak: str, forum: str, portal: str, blog: str, paste: str, mirror: str,
                         btc_ransom: str, btc_broker: str, btc_cashout: str, xmr: str,
                         c2a: str, c2b: str, c2c: str, loader_hash: str, locker_hash: str, pgp: str,
                         support: str, recruit: str) -> list[Template]:
    companies = list(COMPANIES)
    rng.shuffle(companies)
    extra_c2 = [g.c2_domain(rng) for _ in range(6)]
    extra_hash = [g.sha256(rng) for _ in range(6)]
    cves = ("CVE-2024-3400", "CVE-2023-4966", "CVE-2024-21887", "CVE-2023-27997", "CVE-2024-1709")

    def victim(rng: random.Random, n: int) -> tuple[str, str, str, str]:
        company, sector, town = companies[(n - 1) % len(companies)]
        slug = company.lower().split(" ltd")[0].replace("&", "and").replace(" ", "-")
        cve = rng.choice(cves)
        status = rng.choice(("negotiation open", "negotiation failed", "deadline extended once", "no response from victim"))
        return (leak, f"/victims/{slug}-{n:02d}", f"{company} — data publication", f"""
            CRIMSON KRAKEN — VICTIM DISCLOSURE
            Company: {company} ({sector}, {town}, Zambia, {rng.randint(40, 900)} employees)
            Status: {status}. Publication in {rng.randint(2, 9)} days.
            We hold {rng.randint(60, 2400)} GB of finance records, payroll, supplier contracts and email
            archives. Demand: {_kwacha(rng, 400, 6000)}. Initial access: {cve}. Encryptor: KrakenLock.
            Contact the negotiation portal at {portal} or write to {support}.
            Monero: {xmr}  Bitcoin: {btc_ransom}
            Telegram: @krakenlock_news""")

    def chat(rng: random.Random, n: int) -> tuple[str, str, str, str]:
        company, _, town = companies[(n + 6) % len(companies)]
        offer, demand = _kwacha(rng, 50, 400), _kwacha(rng, 800, 5000)
        return (portal, f"/chat/{rng.randint(10000, 99999)}-{n:02d}", f"Negotiation transcript excerpt — {company}", f"""
            Crimson Kraken negotiation chat (archived, fictional)
            [victim] We are a {town}-based company in Zambia. We can offer {offer}.
            [support] Your network was valued at {demand}. Decryptor price is final after the deadline.
            [victim] Can we pay in kwacha through a local agent?
            [support] Monero only: {xmr}. Bitcoin accepted at {btc_ransom} with a 10% surcharge.
            [support] Proof of data: three files from your finance share have been uploaded to {leak}.
            Support contact: {support}""")

    def reply(rng: random.Random, n: int) -> tuple[str, str, str, str]:
        handle = HANDLES[(n - 1) % len(HANDLES)]
        town = rng.choice(TOWNS)
        topic = rng.choice((
            f"Kitw3_Br0ker delivered a {town} healthcare access within a day; the Crimson Kraken affiliate paid from {btc_broker}'s counterpart wallet.",
            f"Gh0stwr1ter77 (now Kr4ken_0ps) confirmed the PGP key {pgp} on the affiliate channel again.",
            f"The SilentTide loader hash {loader_hash} is still what the KrakenLock builder ships for Zambian targets.",
            f"Affiliate payouts for the {town} jobs moved to {btc_cashout} after the old address {btc_broker} was retired.",
            f"Beacons from the latest {town} intrusion in Zambia talk to {rng.choice(extra_c2)} as well as {c2a}.",
            f"Kitw3_Br0ker is offering Zambian government contractor VPN access this week, {town} region, priced in kwacha for locals.",
        ))
        return (forum, f"/t/kraken-thread-{n:02d}", f"Re: Crimson Kraken activity in Zambia ({n})", f"""
            Posted by {handle} · Underlight Forum · Ransomware sub-board
            {topic}
            Victims so far are all Zambian: Lusaka, Copperbelt and now {town}. Recruitment still runs
            through {recruit} and Telegram @krakenlock_news. Negotiations at {portal}.""")

    def digest(rng: random.Random, n: int) -> tuple[str, str, str, str]:
        company_a, _, town_a = companies[(n + 2) % len(companies)]
        company_b, _, town_b = companies[(n + 9) % len(companies)]
        day = 6 + n * 3
        return (mirror, f"/channels/krakenlock_news/week-{n:02d}", f"Telegram digest — krakenlock_news, week {n + 1}", f"""
            Archived digest of Telegram channel @krakenlock_news (invented training record)
            Day {day}: {company_a} ({town_a}, Zambia) listed on {leak}.
            Day {day + 1}: {company_b} ({town_b}) given {rng.randint(3, 10)} days. Demand {_kwacha(rng, 500, 4500)}.
            Day {day + 2}: New KrakenLock build. Loader SHA-256 {rng.choice(extra_hash)}.
            Day {day + 2}: Affiliates in Southern Africa: contact {recruit}. Payments via {btc_cashout}.""")

    def iocs(rng: random.Random, n: int) -> tuple[str, str, str, str]:
        company, _, town = companies[(n + 4) % len(companies)]
        return (paste, f"/p/kraken-incident-{n:02d}", f"Indicators — Crimson Kraken incident {n:02d} ({town}, Zambia)", f"""
            Incident: {company}, {town}, Zambia. Attribution: Crimson Kraken (KrakenLock).
            C2: {rng.choice(extra_c2)}, {rng.choice((c2a, c2b, c2c))}
            Loader: SilentTide sha256 {rng.choice(extra_hash)}
            Encryptor: KrakenLock sha256 {locker_hash}
            Ransom note wallets: {btc_ransom}  {xmr}
            Negotiation portal: {portal}  Leak site: {leak}
            Tooling: Cobalt Strike beacon, Mimikatz. Shared with ZMCIRT for Zambian responders.""")

    def advisory(rng: random.Random, n: int) -> tuple[str, str, str, str]:
        town = TOWNS[(n * 3) % len(TOWNS)]
        cve = rng.choice(cves)
        return (blog, f"/advisories/kraken-{n:02d}", f"Responder note {n:02d}: KrakenLock intrusion at a {town} organisation", f"""
            An incident responder in {town}, Zambia describes a KrakenLock case: the attacker entered
            through {cve}, deployed the SilentTide loader (SHA-256 {loader_hash}) and staged
            Cobalt Strike before encrypting with KrakenLock (SHA-256 {locker_hash}).
            Beacons resolved {c2b} and {rng.choice(extra_c2)}. The ransom note pointed to {portal}
            and {support}. The access was most likely purchased from Kitw3_Br0ker, who advertised
            {town} VPN access on Underlight Forum the week before. Report to ZMCIRT.""")

    return [victim, reply, iocs, chat, digest, advisory]


# ── 2. Mobile-money marketplace ──────────────────────────────────────────────


def market_templates(rng: random.Random, *, market: str, forum: str, vendor_site: str, mirror: str, paste: str,
                     escrow: str, admin_wallet: str, vendor_wallet: str, xmr: str, eth: str, c2: str,
                     stealer_hash: str, admin_mail: str, vendor_mail: str) -> list[Template]:
    small_vendors = [(f"{h}_shop", g.btc_address(rng)) for h in ("Zed_Reaper", "ChipataLogs", "MosiTide", "NkanaRoot")]
    extra_c2 = [g.c2_domain(rng) for _ in range(4)]
    extra_hash = [g.sha256(rng) for _ in range(4)]
    products = (
        "ZedPay mobile-money wallet logins", "Mosi Savings Bank internet-banking sessions",
        "Kwacha Credit Union app sessions", "school-fee portal accounts", "payroll portal logins",
        "agent-line mobile-money accounts", "airtime reseller dashboards",
    )

    def listing(rng: random.Random, n: int) -> tuple[str, str, str, str]:
        vendor = rng.choice(("K4lulu_L0gs", "K4lulu_L0gs", "SilkPhantom9"))
        wallet = vendor_wallet if vendor == "K4lulu_L0gs" else xmr
        product = products[(n - 1) % len(products)]
        town = rng.choice(TOWNS)
        return (market, f"/listing/zm-{n:03d}", f"ZM section listing {n:03d} — {product}", f"""
            Dusk Bazaar · ZM section · listing #{n:03d}
            Vendor: {vendor} · Product: {rng.randint(20, 400)} {product}
            Victims located in {town} and Lusaka, Zambia. Balances verified at listing time;
            average balance {_kwacha(rng, 1, 40)}. Price {rng.choice(('0.004', '0.009', '0.015', '0.03'))} BTC.
            Escrow: {escrow}. Vendor payout address: {wallet}. Replacement within 24h.
            Source: RedLine Stealer logs collected through fake installers aimed at Zambian users.""")

    def review(rng: random.Random, n: int) -> tuple[str, str, str, str]:
        handle = HANDLES[(n + 3) % len(HANDLES)]
        vendor = rng.choice(("K4lulu_L0gs", "SilkPhantom9"))
        return (forum, f"/t/dusk-feedback-{n:02d}", f"Dusk Bazaar feedback thread {n:02d}", f"""
            Posted by {handle} · Underlight Forum · Market reviews
            Bought a Zambia bundle from {vendor}. {rng.choice((
                "Half the ZedPay logins were already drained, replacement arrived in six hours.",
                "Mosi Savings Bank sessions worked; cashed out through a Lusaka agent line.",
                "Cookies matched the K4lulu_L0gs morning drop, so SilkPhantom9 is clearly reselling.",
                "Escrow released late again. Dusk_4dmin blamed the wallet " + escrow + ".",
            ))}
            Payment went through escrow {escrow}. Vendor contact {vendor_mail} / @KaluluLogShop.
            Victims were in {rng.choice(TOWNS)}, Zambia.""")

    def small_vendor(rng: random.Random, n: int) -> tuple[str, str, str, str]:
        handle, wallet = small_vendors[(n - 1) % len(small_vendors)]
        return (market, f"/vendor/{handle}/{n:02d}", f"Vendor profile — {handle}", f"""
            Vendor handle {handle} · Level {rng.randint(1, 3)} · {rng.randint(8, 90)} completed orders
            Resells Zambia-pack logs bought wholesale from K4lulu_L0gs; mostly ZedPay and
            Mosi Savings Bank accounts from {rng.choice(TOWNS)} and Lusaka. Payout address {wallet}.
            Bond paid to escrow {escrow}. Questions to {admin_mail}. Also on @duskbazaar_updates.""")

    def admin_note(rng: random.Random, n: int) -> tuple[str, str, str, str]:
        return (mirror, f"/news/update-{n:02d}", f"Dusk Bazaar announcement {n:02d}", f"""
            Announcement by user Dusk_4dmin, Dusk Bazaar
            {rng.choice((
                "Withdrawals are delayed while the escrow wallet is migrated. Funds are safe.",
                "The ZM section now has its own moderator. Zambian bank listings must include town and balance.",
                "Vendors caught reusing another vendor's logs lose their level. SilkPhantom9 has been warned.",
                "Commission on Zambian mobile-money listings drops to 3% this month.",
            ))}
            Escrow remains {escrow}. Treasury address {admin_wallet}. Support {admin_mail}. Mirror {mirror}.""")

    def infra(rng: random.Random, n: int) -> tuple[str, str, str, str]:
        return (paste, f"/p/zm-stealer-{n:02d}", f"RedLine Stealer build {n:02d} — Zambia pack infrastructure", f"""
            Sample distributed as a fake installer ("free kwacha airtime", "ZedPay balance checker")
            to users in {rng.choice(TOWNS)} and Lusaka, Zambia.
            C2: {rng.choice(extra_c2)} (previous build used {c2})
            Build SHA-256: {rng.choice(extra_hash)}  Earlier build: {stealer_hash}
            Panel owner: Telegram @KaluluLogShop, email {vendor_mail}.
            Stolen logins appear on Dusk Bazaar and {vendor_site} within a day. Reported losses
            {_kwacha(rng, 1, 30)} to {_kwacha(rng, 30, 60)} per victim.""")

    def victim_report(rng: random.Random, n: int) -> tuple[str, str, str, str]:
        town = TOWNS[(n * 5) % len(TOWNS)]
        return (forum, f"/t/zm-victims-{n:02d}", f"Zambian victims discussing drained accounts ({n:02d})", f"""
            Posted by {HANDLES[(n + 7) % len(HANDLES)]} · Underlight Forum · OSINT
            Summary of {rng.randint(4, 30)} victim complaints from {town}, Zambia collected from public
            groups: ZedPay and Mosi Savings Bank accounts emptied after installing a cracked
            Windows tool. Amounts {_kwacha(rng, 2, 12)} to {_kwacha(rng, 12, 45)}. The stolen sessions
            match listings by K4lulu_L0gs and SilkPhantom9 on Dusk Bazaar, escrow {escrow}.""")

    return [listing, review, infra, small_vendor, victim_report, admin_note]


# ── 3. SMS phishing kit ──────────────────────────────────────────────────────


def phishing_templates(rng: random.Random, *, shop: str, forum: str, panel: str, paste: str,
                       wallet_a: str, wallet_b: str, eth: str, lure_a: str, lure_b: str, lure_c: str,
                       host_domain: str, kit_hash: str, dev_mail: str, sales_mail: str) -> list[Template]:
    lures = [g.c2_domain(rng).rsplit(".", 1)[0] + ".co.zm" for _ in range(10)]
    hosts = [g.c2_domain(rng) for _ in range(4)]
    versions = ("3.2", "3.2.1", "3.3", "3.3.2", "3.4")
    resellers = [(h, g.eth_address(rng)) for h in ("Ph1sh_L0rd", "Zed_Reaper", "L1vingst0ne_x", "Bemba_Byte")]
    brands = ("ZedPay", "Mosi Savings Bank", "Kwacha Credit Union", "Zambia Revenue portal lookalike")

    def campaign(rng: random.Random, n: int) -> tuple[str, str, str, str]:
        town = TOWNS[(n * 2) % len(TOWNS)]
        brand = brands[(n - 1) % len(brands)]
        return (paste, f"/p/zm-campaign-{n:02d}", f"Mirage Kit campaign report {n:02d} — {town}, Zambia", f"""
            Observed SMS phishing wave against {brand} customers in {town} and Lusaka, Zambia.
            Lure domain: {lures[(n - 1) % len(lures)]}  Earlier lure: {rng.choice((lure_a, lure_b, lure_c))}
            Hosting: BulletHost. Panel: {host_domain} (alternate {rng.choice(hosts)}).
            Kit archive SHA-256 {kit_hash}. Operator contact in page source: {dev_mail}.
            Estimated {rng.randint(40, 900)} SMS lures sent; {rng.randint(3, 60)} captured sessions.""")

    def lure(rng: random.Random, n: int) -> tuple[str, str, str, str]:
        brand = brands[(n + 1) % len(brands)]
        return (shop, f"/templates/zm-{n:02d}", f"Zambia pack template {n:02d} — {brand}", f"""
            MIRAGE KIT · Zambia pack · template {n:02d}
            Target brand: {brand}. Lure SMS (English): "Your {brand} account will be suspended.
            Verify now: http://{lures[(n + 3) % len(lures)]}/verify". Bemba and Nyanja variants included.
            Captures: phone number, PIN, one-time code, session cookie (MFA relay).
            Included in Pro plan. Licence payments to {wallet_a}; sales {sales_mail}; updates @mirage_updates.""")

    def reseller(rng: random.Random, n: int) -> tuple[str, str, str, str]:
        handle, wallet = resellers[(n - 1) % len(resellers)]
        return (forum, f"/t/mirage-reseller-{n:02d}", f"Mirage Kit licences for Zambian campaigns ({n:02d})", f"""
            Posted by {handle} · Underlight Forum · Phishing
            Reselling Mirage Kit {rng.choice(versions)} licences with the Zambia pack. Buyers run SMS
            campaigns against ZedPay and Mosi Savings Bank users in {rng.choice(TOWNS)}, Zambia.
            I pay M1rage_D3v in Ethereum ({eth}); my customers pay me at {wallet}.
            Hosting through BulletHost. Developer support {dev_mail}, Telegram @mirage_updates.""")

    def changelog(rng: random.Random, n: int) -> tuple[str, str, str, str]:
        version = versions[(n - 1) % len(versions)]
        return (panel, f"/changelog/{version}-{n:02d}", f"Mirage Kit {version} — release notes", f"""
            Mirage Kit {version} · posted by M1rage_D3v
            {rng.choice((
                "Zambia pack: refreshed ZedPay template, new lure domain rotation list.",
                "MFA relay now handles app-based one-time codes used by Zambian banks.",
                "Added Nyanja SMS lure text alongside English and Bemba.",
                "Panel moved to " + rng.choice(hosts) + " on BulletHost; old panel " + host_domain + " redirects.",
            ))}
            Archive SHA-256 {kit_hash}. Licences: {wallet_a} (Starter), {wallet_b} (Pro and Reseller).
            Support {dev_mail}. Lusaka and Copperbelt campaigns remain the most active.""")

    def victim(rng: random.Random, n: int) -> tuple[str, str, str, str]:
        town = TOWNS[(n * 7) % len(TOWNS)]
        return (forum, f"/t/zm-phish-victims-{n:02d}", f"Reports from Zambian users hit by the ZedPay SMS lure ({n:02d})", f"""
            Posted by {HANDLES[(n + 5) % len(HANDLES)]} · Underlight Forum · OSINT
            {rng.randint(3, 25)} users in {town}, Zambia reported losing {_kwacha(rng, 1, 8)} to
            {_kwacha(rng, 8, 25)} after entering a one-time code on {lures[(n + 5) % len(lures)]}.
            The page source references {dev_mail} and the panel at {host_domain}, matching the
            Mirage Kit paste. Resellers point buyers to {sales_mail}.""")

    def wallet(rng: random.Random, n: int) -> tuple[str, str, str, str]:
        _, reseller_wallet = resellers[(n + 1) % len(resellers)]
        return (paste, f"/p/mirage-payments-{n:02d}", f"Mirage Kit payment flows {n:02d}", f"""
            Licence payments observed: {rng.randint(3, 20)} transfers to {wallet_a} and {rng.randint(1, 8)}
            to {wallet_b} during the Zambia campaign window. Reseller settlement in Ethereum from
            {reseller_wallet} to the developer address {eth}. Buyers are operating in Lusaka,
            Kitwe and {rng.choice(TOWNS)}, Zambia. Developer contact {dev_mail}.""")

    return [campaign, lure, reseller, victim, changelog, wallet]
