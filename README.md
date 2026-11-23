# US Trucking Company & Carrier Leads Finder

Find US trucking companies by **what they haul**, **how many trucks they run** and **where they are**. Pick "refrigerated carriers in Ohio with 5 to 50 trucks" or "flatbed and building-materials haulers within 100 miles of 75201" and get one clean, vetted list: phone, MC number, operating authority, insurance on file, inspections, out-of-service rates, crashes and a safety score for every carrier. Official FMCSA data, no login, no API key.

## Who uses it

- **Freight brokers and 3PLs** finding capacity: reefer, tanker, flatbed or car-hauler carriers in a lane, already screened for active authority, insurance and out-of-service orders.
- **Shippers** building a carrier list for a region or a special load (hazmat, livestock, oversize machinery).
- **Sales teams that sell to trucking companies**: truck and trailer dealers, insurance agents, factoring companies, fuel cards, ELD and TMS software, truck repair, driver staffing. Filter by fleet size to hit your sweet spot (say 10 to 100 trucks).
- **Insurers and lenders** checking safety records across a book of carriers.

## What you get

The input form comes pre-filled with **refrigerated food carriers, Ohio, 100 results**. Click Start and you get this kind of list in about 15 seconds, for about $0.41. These rows are from a test run on November 23, 2026:

| Carrier | MC number | Phone | City | Power units | Authority | Safety score (0-100) |
|---|---|---|---|---|---|---|
| Greenwood Motor Lines Inc (R L Carriers) | MC99074 | (937) 382-1494 | Wilmington | 10,382 | active | 96 |
| Zeegot Logistics LLC | MC30689 | (463) 271-2179 | Cincinnati | 320 | active | 94 |
| Mast Trucking Inc | MC171923 | (330) 674-8913 | Massillon | 135 | active | 91 |
| Caruso Trucking Ltd | MC337918 | (513) 860-9200 | Cincinnati | 94 | active | 92 |
| Sysco Cincinnati LLC | MC1099733 | (513) 769-2226 | Cincinnati | 73 | active | 93 |

Every row also has:

- **Company**: legal name, DBA, street address, ZIP, fax, a company mailbox (dispatch@, safety@...) when one is registered, the company's email domain, and its website when the domain clearly matches the company name.
- **Fleet**: power units, drivers, CDL drivers, trucks, tractors, trailers, annual miles, cargo types, hazmat, for-hire or private fleet, interstate or intrastate, whether it is also a broker or a shipper.
- **Authority and insurance**: MC number, authority status (active, pending, inactive, broker only, none), common/contract/broker authority, liability insurance (BIPD) on file and required, cargo insurance on file.
- **Safety**: FMCSA safety rating, inspections in the last 24 months, driver and vehicle out-of-service rates, safety alerts (unsafe driving, hours of service, vehicle maintenance...), crashes, fatalities and injuries in the last 24 months, active out-of-service orders, a 0-100 safety score, and a link to the carrier's FMCSA SAFER page.
- **Age**: date the USDOT number was registered, years registered, date of the last FMCSA update.

Typical results: refrigerated for-hire carriers in Ohio return about 1,150 vetted carriers in a few seconds; general-freight carriers with 10 to 100 trucks within 50 miles of Chicago about 1,500. Over 99% have a phone number.

## Filters

- **Where**: states, or a ZIP code and radius (up to 500 miles, across state lines).
- **What they haul**: 29 FMCSA cargo types, including general freight, refrigerated food, fresh produce, meat, beverages, building materials, metal coils, machinery and large objects, logs and lumber, motor vehicles, intermodal containers, liquids and gases, chemicals, dry bulk, grain and hay, livestock, oilfield equipment, household goods, garbage. Plus **hazmat only**.
- **Carrier type**: for-hire carriers, private fleets, or both. Only carriers with **active operating authority** (on by default for for-hire).
- **Fleet size**: minimum and maximum power units.
- **Age**: minimum years registered, or maximum years to find **new trucking companies**. Only carriers that updated their FMCSA registration recently (default: 24 months) so dormant companies are left out.
- **Safety**: leave out carriers with an active out-of-service order or Unsatisfactory rating (on by default), cap the vehicle out-of-service rate.
- **Contact**: only carriers with a phone number, or with a company email.
- **Sort**: biggest fleets, closest to your ZIP, newest, longest in business, or best safety record first.

## How it works

1. It searches the FMCSA Company Census (every registered USDOT number) on data.transportation.gov for active carriers matching your filters.
2. For each carrier it adds operating authority and insurance from the FMCSA licensing data, 24-month inspection results and alerts from the Safety Measurement System, crashes from the FMCSA crash file, and out-of-service orders.
3. It drops carriers that fail your filters, one-person registrations whose name is just a person's name, and duplicate registrations of the same company (same name and phone).

## Data and privacy

Only public registration data that carriers file with the US Department of Transportation. No company officer names, no cell phone numbers, no personal email addresses (only role mailboxes such as dispatch@ or safety@), and one-person registrations under a person's own name are left out. Nothing behind a login.

This Actor is independent and not affiliated with FMCSA or the US DOT. FMCSA data can lag by a few weeks; check the SAFER link before booking a load.

## Tips

- Whole-state searches with no fleet-size filter can match tens of thousands of carriers; set **Maximum results** or a minimum fleet size.
- Run it on a schedule with **Maximum years registered = 1** and **Sort by newest** to get new trucking companies every week.
- National averages to compare against: vehicle out-of-service rate about 22%, driver out-of-service rate about 6%.

## How much does it cost?

**$4 per 1,000 carriers** ($0.004 each), plus $0.005 per run. You pay only for carriers returned.

| You get | You pay |
|---|---|
| 100 carriers | about $0.41 |
| 1,000 carriers | about $4.01 |
| 5,000 carriers | about $20.01 |

Apify's free plan includes $5 of credit every month, which covers about 1,200 carriers, so you can try it without paying anything. Set **Maximum results** or a spending limit and the run stops there.

## FAQ

**Is this an FMCSA / SAFER scraper?** It uses the official FMCSA datasets (Company Census, licensing and insurance, SMS inspections, crashes) published on data.transportation.gov, so it is faster and more complete than scraping SAFER pages one by one.

**Can I get a list of new trucking companies?** Yes. Set Maximum years registered to 1 and sort by newest. Schedule it weekly to get new authorities as they appear.

**Can I find reefer, flatbed or hazmat carriers in a lane?** Yes. Pick the cargo types and a ZIP code with a radius, or one or more states. Add a fleet-size range to find carriers your size.

**Does it include MC numbers and insurance?** Yes: MC number, authority status, liability (BIPD) and cargo insurance on file, plus inspections, out-of-service rates and crashes.

**Can I export carrier lists to Excel or my CRM?** Download as CSV, Excel or JSON, or send results to Google Sheets, HubSpot, Zapier or Make with Apify integrations.

## Use it from your own tools

Run it from the Apify API (see the API tab), on a schedule, or from Zapier, Make, n8n, Google Sheets and Slack integrations. Each run's results stay in a dataset you can download as CSV, Excel, JSON or XML.

## More B2B lead lists from the same developer

Same pricing, same clean one-row-per-company format:

- [US Manufacturer & Machine Shop Leads](https://apify.com/habes22/fabricator-finder): metal fabricators and machine shops by capability (laser, CNC, welding)
- [Construction Contractor & Subcontractor Finder](https://apify.com/habes22/construction-contractor-finder): commercial contractors and subs by trade
- [Medical Practice & Clinic Leads (NPI)](https://apify.com/habes22/medical-practice-leads): dental, medical and therapy practices by specialty
- [Government Bids & RFPs (SAM.gov + State)](https://apify.com/habes22/gov-bids-finder): open federal, state and local bids for what you sell
- [Commercial Property Owner Leads](https://apify.com/habes22/commercial-property-owner-leads): who owns offices, warehouses and other commercial buildings
- [Solar & Battery Installer Leads](https://apify.com/habes22/solar-installer-leads): US solar installers ranked by how many systems they really installed
