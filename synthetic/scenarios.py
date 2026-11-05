"""Built-in synthetic scenarios.

Every name, company, handle and page in here is invented. The actors are
fictional, the victims are fictional organisations placed in real Zambian places
(Lusaka, the Copperbelt, Livingstone), and the identifiers come from
:mod:`synthetic.generator` (well-formed but unowned). The vulnerabilities (CVE ids)
and a few tool names (Cobalt Strike, Mimikatz, ...) are real public references so
the extraction and enrichment stages have something familiar to recognise.

The scenarios are written so the finished investigation shows what the product is
for: one actor appearing under several handles, wallets and infrastructure shared
between pages, and relationships that only emerge when pages are read together.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from . import generator as g
from . import filler


@dataclass
class SyntheticPage:
    url: str
    title: str
    text: str
    snippet: str = ""


@dataclass
class Scenario:
    id: str
    title: str
    description: str
    suggested_query: str
    pages: list[SyntheticPage] = field(default_factory=list)
    highlights: list[str] = field(default_factory=list)
    builtin: bool = True
    scope: str = "global"  # intelligence scope the UI selects for this scenario

    def summary(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "suggested_query": self.suggested_query,
            "pages": len(self.pages),
            "highlights": list(self.highlights),
            "builtin": self.builtin,
            "scope": self.scope,
        }


def _page(host: str, path: str, title: str, text: str) -> SyntheticPage:
    body = "\n".join(line.strip() for line in text.strip().splitlines())
    snippet = " ".join(body.split())[:180]
    return SyntheticPage(url=f"http://{host}{path}", title=title, text=body, snippet=snippet)


# ── 1. Ransomware crew hitting Zambian firms ─────────────────────────────────


def _copperbelt_ransomware() -> Scenario:
    rng = random.Random(7101)
    leak, forum, portal, blog, paste, mirror = (g.onion_host(rng) for _ in range(6))
    btc_ransom, btc_broker, btc_cashout = g.btc_address(rng), g.btc_address(rng), g.btc_address(rng)
    xmr = g.xmr_address(rng)
    c2a, c2b, c2c = g.c2_domain(rng), g.c2_domain(rng), g.c2_domain(rng)
    loader_hash, locker_hash = g.sha256(rng), g.sha256(rng)
    pgp = "".join(rng.choice("0123456789ABCDEF") for _ in range(40))
    support = "ck-support@mailbox-onion.example"
    recruit = "gh0stwr1ter77@secmail-onion.example"

    pages = [
        _page(leak, "/victims/kafue-freight", "Kafue Freight Logistics Ltd — data publication", f"""
            CRIMSON KRAKEN — VICTIM DISCLOSURE
            Company: Kafue Freight Logistics Ltd (road freight, Lusaka, 620 employees)
            Status: negotiation failed. Publication in 5 days.
            We hold 1.8 TB including customer manifests, cross-border Zambia-DRC transport contracts,
            finance spreadsheets and HR files. The company was given 7 days and offered K150,000.
            Our demand was K4,800,000. KrakenLock was deployed after initial access through an
            unpatched firewall (CVE-2024-3400). Contact the negotiation portal at {portal}
            or write to {support}. Payment in Monero only: {xmr}
            Group contact on Telegram: @krakenlock_news"""),
        _page(leak, "/victims/copperbelt-medical", "Copperbelt Medical Group — data publication", f"""
            CRIMSON KRAKEN — VICTIM DISCLOSURE
            Company: Copperbelt Medical Group (private healthcare, 21 clinics across Ndola and Kitwe)
            Status: partial payment received, remainder overdue.
            Patient scheduling data and insurer correspondence will be released in stages.
            Access vector: stolen VPN credentials bought from Kitw3_Br0ker. Encryptor: KrakenLock v2.
            Pay to bitcoin address {btc_ransom} or Monero {xmr}. Support: {support}"""),
        _page(forum, "/t/affiliates-wanted", "KrakenLock affiliate programme — now recruiting", f"""
            Posted by Gh0stwr1ter77 · Underlight Forum · Ransomware sub-board
            Crimson Kraken is opening a limited number of affiliate slots. 80/20 split in your favour.
            Provided: KrakenLock builder, SilentTide loader, a hardened negotiation portal and
            chat support. Southern and Central African targets are welcome: weaker patching,
            thin incident response, and companies that will pay quietly. No hospitals in
            emergency care. Apply by email to {recruit} or on Telegram @krakenlock_news.
            PGP fingerprint for verification: {pgp}"""),
        _page(forum, "/t/zambia-vpn-access", "Zambian corporate VPN access — logistics, mining, healthcare", f"""
            Posted by Kitw3_Br0ker · Underlight Forum · Access market
            Selling verified VPN access to Zambian companies (Lusaka, Copperbelt, Livingstone).
            Obtained through exploitation of CVE-2024-3400 on exposed GlobalProtect gateways and
            through CVE-2023-4966 session theft. Sectors in stock: logistics, copper mining
            services, healthcare, hospitality. Price 0.4–1.2 BTC per access, or K15,000 per
            access for local buyers. Payment to {btc_broker}.
            Deals handled with Crimson Kraken affiliates get priority. Reputation: 41 completed deals."""),
        _page(portal, "/", "Crimson Kraken — negotiation portal", f"""
            Your files have been encrypted by KrakenLock. Do not rename files or run recovery tools.
            To receive a decryptor, open a chat with our support team and upload one test file.
            We accept Monero (preferred) or bitcoin. Kwacha-denominated invoices are converted at
            the rate on the day of payment.
            Monero: {xmr}
            Bitcoin: {btc_ransom}
            Support email: {support}
            Do not contact law enforcement: negotiators monitor the chat and the clock does not stop."""),
        _page(blog, "/notes/krakenlock-internals", "Notes on KrakenLock — an incident responder's view from Lusaka", f"""
            KrakenLock is a Rust-based encryptor that disables backups and enumerates network shares.
            Observed in two Zambian incidents: initial access through an exposed firewall
            (CVE-2024-3400), credential theft with Mimikatz, lateral movement with Cobalt Strike
            beacons, and the SilentTide loader staging the encryptor. Beacons called back to {c2a}
            and {c2b}.
            Loader SHA-256: {loader_hash}
            Encryptor SHA-256: {locker_hash}
            Victims are told to contact Crimson Kraken through {portal}. Zambian organisations
            affected by similar intrusions should report to the national CERT (ZMCIRT)."""),
        _page(paste, "/p/kraken-iocs", "Crimson Kraken indicator dump — Zambian incidents", f"""
            Indicators collected from three Zambian incidents attributed to Crimson Kraken
            C2: {c2a}, {c2b}, {c2c}
            Loader: SilentTide  sha256 {loader_hash}
            Encryptor: KrakenLock sha256 {locker_hash}
            Leak site: {leak}
            Negotiation portal: {portal}
            Wallets seen in ransom notes: {btc_ransom}  {xmr}"""),
        _page(forum, "/t/new-name-same-team", "Re: Is Gh0stwr1ter77 still active?", f"""
            Posted by Kr4ken_0ps · Underlight Forum
            Yes. Gh0stwr1ter77 and I are the same operator; I rotated handles after the old account
            was flagged. Same PGP key ({pgp}) so you can verify. Crimson Kraken continues under
            this name. Affiliate payments now flow through {btc_cashout}. Old address {btc_broker}
            is retired. Support is still {support}. Lusaka and Ndola leads are still welcome."""),
        _page(mirror, "/channels/krakenlock_news", "Telegram digest — krakenlock_news", f"""
            Archived digest of Telegram channel @krakenlock_news
            Day 1: Kafue Freight Logistics Ltd listed on the leak site {leak}.
            Day 3: Copperbelt Medical Group listed after partial payment.
            Day 5: Reminder to affiliates — apply via {recruit}. New builds ship with SilentTide.
            Day 6: Cash-out wallet rotated to {btc_cashout}.
            This archived channel entry is an invented training record and contains no operational data."""),
        _page(blog, "/advisories/citrix-session-theft", "Advisory: session theft campaigns against Zambian logistics and mining suppliers", f"""
            Analysts have linked a wave of intrusions into Zambian logistics and copper mining
            service providers (Lusaka, Kitwe, Ndola) to the exploitation of CVE-2023-4966
            (session token disclosure) followed by ransomware deployment. Access appears to be
            brokered: the same broker handle, Kitw3_Br0ker, advertised Zambian VPN access days
            before encryption events. Follow-on activity used Cobalt Strike and delivered
            KrakenLock. Infrastructure overlaps with {c2b} and {c2c}."""),
        _page(forum, "/t/follow-the-money", "Following the money: Crimson Kraken wallets", f"""
            Posted by Ch4inWatch_K · Underlight Forum
            Tracing the ransom wallets: {btc_ransom} received 6 payments in 14 days and forwarded
            funds to {btc_cashout}. The broker address {btc_broker} sent a small test transfer to
            {btc_ransom} the day before the first Zambian victim was listed, suggesting broker and
            operator coordinate payments. Monero address {xmr} appears in every ransom note."""),
    ]
    pages += [
        _page(*spec)
        for spec in filler.expand(rng, filler.ransomware_templates(
            rng, leak=leak, forum=forum, portal=portal, blog=blog, paste=paste, mirror=mirror,
            btc_ransom=btc_ransom, btc_broker=btc_broker, btc_cashout=btc_cashout, xmr=xmr,
            c2a=c2a, c2b=c2b, c2c=c2c, loader_hash=loader_hash, locker_hash=locker_hash, pgp=pgp,
            support=support, recruit=recruit,
        ), existing=len(pages))
    ]
    return Scenario(
        id="zambia-copperbelt-ransomware",
        title="Ransomware crew targeting Zambian firms",
        description="A fictional ransomware group, its recruiter and an access broker selling Lusaka and Copperbelt company VPN access.",
        suggested_query="Crimson Kraken ransomware attacks on Zambian companies and the broker selling access",
        pages=pages,
        scope="zambia",
        highlights=[
            "Two fictional Zambian victims: a Lusaka freight firm and a Copperbelt healthcare group",
            "A local access broker whose wallet pays the ransom wallet",
            "One operator under two handles (Gh0stwr1ter77 and Kr4ken_0ps), linked by a shared PGP key",
            "CVE-2024-3400 and CVE-2023-4966 as the way in; kwacha amounts in the demands",
        ],
    )


# ── 2. Stolen mobile-money and bank logins ───────────────────────────────────


def _mobile_money_market() -> Scenario:
    rng = random.Random(7202)
    market, forum, vendor_site, mirror, paste = (g.onion_host(rng) for _ in range(5))
    escrow, admin_wallet, vendor_wallet = g.btc_address(rng), g.btc_address(rng), g.btc_address(rng)
    xmr = g.xmr_address(rng)
    eth = g.eth_address(rng)
    c2 = g.c2_domain(rng)
    stealer_hash = g.sha256(rng)
    admin_mail = "admin@duskmail-onion.example"
    vendor_mail = "kalulu.logs@secmail-onion.example"

    pages = [
        _page(market, "/", "Dusk Bazaar — front page", f"""
            Dusk Bazaar · escrow marketplace · est. 2025
            Categories: stolen account data, stealer logs, access, tools, guides.
            New: ZM section — Zambian mobile-money and online-banking logins, priced in bitcoin or
            ZMW-equivalent. Vendors accepted by application. Commission 4%. All orders protected by
            escrow wallet {escrow}. Support: {admin_mail}. Mirror: {mirror}.
            Telegram: @duskbazaar_updates"""),
        _page(market, "/vendor/K4lulu_L0gs", "Vendor profile — K4lulu_L0gs", f"""
            Vendor handle K4lulu_L0gs · Level 7 · 1,203 completed orders · 99.1% positive
            Offers: daily stealer log bundles (RedLine Stealer and Raccoon Stealer output) with a
            Zambia pack: Lusaka and Copperbelt browsers with saved ZedPay mobile-money and Mosi
            Savings Bank logins. Pays in bitcoin to {vendor_wallet} for bulk resupply.
            Contact: {vendor_mail} or @KaluluLogShop on Telegram. Also trades on Underlight Forum
            and on the vendor site {vendor_site}."""),
        _page(market, "/vendor/silkphantom9", "Vendor profile — SilkPhantom9", f"""
            Vendor handle SilkPhantom9 · Level 4 · 311 completed orders · 96.8% positive
            Specialises in corporate account access obtained with RedLine Stealer, including a
            few Zambian mining-supplier and hotel accounts. Escrow only. Replacement within 24h.
            Payments routed to Monero {xmr}. Telegram @SilkPhantomShop. Known to resell bundles first
            listed by K4lulu_L0gs."""),
        _page(vendor_site, "/", "Kalulu's Logs — official vendor site", f"""
            Kalulu's Logs, run by user K4lulu_L0gs. Fresh logs every day at 06:00 UTC.
            Zambia pack: ZedPay wallets, Mosi Savings Bank internet banking, school-fee portals.
            Order direct: {vendor_mail}. Payment in bitcoin {vendor_wallet} or Ethereum {eth}.
            Logs are collected by our own build of RedLine Stealer deployed through fake installers
            for popular Windows tools and "free kwacha airtime" apps. Telegram @KaluluLogShop."""),
        _page(forum, "/t/dusk-review", "Dusk Bazaar — honest review thread", f"""
            Posted by M4rketWatcher · Underlight Forum
            Used Dusk Bazaar for six weeks. Escrow worked every time, support at {admin_mail} answers
            within hours. The admin, user Dusk_4dmin, has the escrow wallet {escrow} moving funds to
            {admin_wallet} twice, which looks like cashing out. K4lulu_L0gs and SilkPhantom9 are the
            busiest vendors, and the Zambia section is the newest and cheapest."""),
        _page(forum, "/t/exit-scam-rumours", "Is Dusk Bazaar about to exit?", f"""
            Posted by M4rketWatcher · Underlight Forum
            Rumours that user Dusk_4dmin is preparing an exit scam: withdrawals delayed since Monday,
            the escrow wallet {escrow} balance dropped to near zero and {admin_wallet} received
            everything. The Telegram channel @duskbazaar_updates denies it. Vendors K4lulu_L0gs and
            SilkPhantom9 have already moved their stock to {vendor_site}."""),
        _page(paste, "/p/stealer-c2", "Infrastructure used by the RedLine Stealer build — Zambia pack", f"""
            Collection server observed in samples distributed through fake installers aimed at
            Zambian users (Lusaka, Kitwe, Livingstone):
            C2 domain {c2}
            Build SHA-256: {stealer_hash}
            Panel owner linked to Telegram @KaluluLogShop and email {vendor_mail}.
            Victims lose ZedPay and bank logins; sellers list them on Dusk Bazaar the same day.
            Typical fraud losses reported by victims range from K2,000 to K45,000."""),
        _page(mirror, "/news/bond-change", "Dusk Bazaar announcement: vendor bond raised", f"""
            Announcement by user Dusk_4dmin: vendor bond raised to 0.05 BTC from next week to remove
            low-quality sellers. Existing vendors in good standing, including K4lulu_L0gs and
            SilkPhantom9, keep their level. Questions to {admin_mail}. Deposits go to the escrow
            wallet {escrow}."""),
        _page(forum, "/t/silkphantom-resells", "SilkPhantom9 reselling K4lulu_L0gs bundles?", f"""
            Posted by L0gSn00p · Underlight Forum
            Compared sample bundles: three of SilkPhantom9's Zambia listings contain the same
            cookies as K4lulu_L0gs's morning drop. SilkPhantom9 is probably buying wholesale. Payment
            address for SilkPhantom9 ({xmr}) is different, but they confirmed buying through
            Telegram from the Kalulu shop."""),
    ]
    pages += [
        _page(*spec)
        for spec in filler.expand(rng, filler.market_templates(
            rng, market=market, forum=forum, vendor_site=vendor_site, mirror=mirror, paste=paste,
            escrow=escrow, admin_wallet=admin_wallet, vendor_wallet=vendor_wallet, xmr=xmr, eth=eth,
            c2=c2, stealer_hash=stealer_hash, admin_mail=admin_mail, vendor_mail=vendor_mail,
        ), existing=len(pages))
    ]
    return Scenario(
        id="zambia-mobile-money-market",
        title="Stolen Zambian mobile-money and bank logins",
        description="A fictional marketplace with a Zambia section, two vendors reselling stealer logs and an admin suspected of cashing out.",
        suggested_query="Dusk Bazaar vendors selling Zambian mobile money and banking logins from stealer logs",
        pages=pages,
        scope="zambia",
        highlights=[
            "A Zambia-specific stealer pack with kwacha loss figures from victims",
            "Vendor-to-vendor supply chain (K4lulu_L0gs feeds SilkPhantom9)",
            "Marketplace escrow wallet forwarding to the admin's wallet",
            "Stealer build tied to a vendor email, Telegram channel and C2 domain",
        ],
    )


# ── 3. SMS phishing aimed at Zambian users ───────────────────────────────────


def _sms_phishing_kit() -> Scenario:
    rng = random.Random(7303)
    shop, forum, panel, paste = (g.onion_host(rng) for _ in range(4))
    wallet_a, wallet_b = g.btc_address(rng), g.btc_address(rng)
    eth = g.eth_address(rng)
    # Lure domains sit on .zm so they look local; the labels are random.
    lure_a, lure_b, lure_c = (g.c2_domain(rng).rsplit(".", 1)[0] + ".co.zm" for _ in range(3))
    host_domain = g.c2_domain(rng)
    kit_hash = g.sha256(rng)
    dev_mail = "mirage.dev@secmail-onion.example"
    sales_mail = "mirage.sales@mailbox-onion.example"

    pages = [
        _page(shop, "/", "Mirage Kit — phishing-as-a-service", f"""
            MIRAGE KIT · hosted login-page templates for 40+ brands, live victim dashboard,
            MFA-relay module, Telegram alerts. New: Zambia pack with ZedPay mobile-money and Mosi
            Savings Bank templates, SMS lure text in English and Bemba. Monthly licence 0.01 BTC.
            Pay to {wallet_a}. Sales: {sales_mail}. Developer channel: @mirage_updates.
            Includes a pre-configured bulletproof hosting plan from BulletHost."""),
        _page(forum, "/t/mirage-release", "Mirage Kit 3.2 released — Zambia pack included", f"""
            Posted by M1rage_D3v · Underlight Forum
            Version 3.2 adds a session-cookie relay that defeats SMS-based MFA and a rotating
            domain feature. The Zambia pack covers ZedPay and Mosi Savings Bank with lure pages
            hosted on .co.zm lookalike domains, for example {lure_a}. Control panel at {panel}.
            Support {dev_mail}, Telegram @mirage_updates. Kit archive SHA-256: {kit_hash}.
            Licences paid to {wallet_a}; large resellers settle in Ethereum at {eth}."""),
        _page(panel, "/login", "Mirage control panel", f"""
            Mirage Kit control panel. Operators sign in to manage campaigns, view captured sessions
            and download logs. Hosted on BulletHost infrastructure; panel domain {host_domain}.
            Active Zambia campaign: ZedPay "account verification" SMS to Lusaka and Copperbelt
            numbers. Lost access? Email {dev_mail}. Licence renewals: bitcoin {wallet_a}."""),
        _page(paste, "/p/mirage-hosts", "Domains serving Mirage Kit login pages — Zambia campaign", f"""
            Observed domains serving Mirage Kit phishing pages impersonating Zambian brands:
            {lure_a}
            {lure_b}
            {lure_c}
            Hosting provider: BulletHost. Panel domain {host_domain}.
            Kit archive SHA-256 {kit_hash}. Operator contact observed in page source: {dev_mail}.
            The same address appears in the forum release post by M1rage_D3v."""),
        _page(forum, "/t/reseller-network", "Mirage Kit reseller network", f"""
            Posted by Ph1sh_L0rd · Underlight Forum
            I resell Mirage Kit licences at a markup, mostly to buyers running SMS campaigns
            against Zambian mobile-money users. I buy in bulk from M1rage_D3v and pay in
            Ethereum ({eth}). My own customers email {sales_mail}. The developer also sells
            custom brand templates; ask on Telegram @mirage_updates."""),
        _page(shop, "/pricing", "Mirage Kit — plans", f"""
            Starter 0.01 BTC/mo · Pro 0.03 BTC/mo · Reseller 0.2 BTC/mo.
            Payments are confirmed automatically at {wallet_b} (Pro and Reseller) or {wallet_a}
            (Starter). All plans include BulletHost hosting. Zambia pack is included in Pro and up.
            Questions: {sales_mail}."""),
        _page(forum, "/t/mfa-relay-howto", "Does the MFA relay work on Zambian mobile-money logins?", f"""
            Posted by Ph1sh_L0rd · Underlight Forum
            Tested the relay against the ZedPay login: it proxies the real page and steals the
            session cookie after the one-time code is entered. Works against SMS and app codes.
            Victims in Lusaka lost between K3,000 and K20,000 each in my tests. Infrastructure I saw
            during testing: {lure_b}. Captured credentials are forwarded to a Telegram bot
            controlled by M1rage_D3v."""),
        _page(paste, "/p/wallet-trace", "Mirage Kit payment wallets", f"""
            Payment wallets advertised by Mirage Kit: {wallet_a} (licences) and {wallet_b}
            (reseller plans). Funds from {wallet_b} were forwarded to the developer's cash-out
            address. Related Ethereum address used by resellers: {eth}. Campaign targeting Zambia
            started after the pack was added in version 3.2."""),
    ]
    pages += [
        _page(*spec)
        for spec in filler.expand(rng, filler.phishing_templates(
            rng, shop=shop, forum=forum, panel=panel, paste=paste,
            wallet_a=wallet_a, wallet_b=wallet_b, eth=eth, lure_a=lure_a, lure_b=lure_b, lure_c=lure_c,
            host_domain=host_domain, kit_hash=kit_hash, dev_mail=dev_mail, sales_mail=sales_mail,
        ), existing=len(pages))
    ]
    return Scenario(
        id="zambia-sms-phishing-kit",
        title="SMS phishing kit aimed at Zambian users",
        description="A fictional phishing-kit developer and resellers running a Zambia pack with lookalike .zm domains and mobile-money lures.",
        suggested_query="Mirage Kit phishing campaign impersonating Zambian mobile money and banks",
        pages=pages,
        scope="zambia",
        highlights=[
            "Lookalike .co.zm domains and a Zambia pack with local-language SMS lures",
            "Developer email appearing on the sales site, the control panel and a paste",
            "Reseller layer that pays the developer in Ethereum",
            "Same kit archive hash seen on several pages; victim losses quoted in kwacha",
        ],
    )


BUILTIN_BUILDERS = (_copperbelt_ransomware, _mobile_money_market, _sms_phishing_kit)
