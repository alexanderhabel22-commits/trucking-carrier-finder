# US Trucking Company & Carrier Leads Finder

Find US trucking companies by **what they haul**, **how many trucks they run** and **where they are**. Pick "refrigerated carriers in Ohio with 5 to 50 trucks" or "flatbed and building-materials haulers within 100 miles of 75201" and get one clean, vetted list: phone, MC number, operating authority, insurance on file, inspections, out-of-service rates, crashes and a safety score for every carrier. Official FMCSA data, no login, no API key.

## Who uses it

- **Freight brokers and 3PLs** finding capacity: reefer, tanker, flatbed or car-hauler carriers in a lane, already screened for active authority, insurance and out-of-service orders.
- **Shippers** building a carrier list for a region or a special load (hazmat, livestock, oversize machinery).
- **Sales teams that sell to trucking companies**: truck and trailer dealers, insurance agents, factoring companies, fuel cards, ELD and TMS software, truck repair, driver staffing. Filter by fleet size to hit your sweet spot (say 10 to 100 trucks).
- **Insurers and lenders** checking safety records across a book of carriers.

## What you get

| company_name | usdot_number | mc_number | power_units | cargo_types | phone | city | state | authority_status | insurance_bipd_on_file_usd | safety_score |
|---|---|---|---|---|---|---|---|---|---|---|
| Example Cold Freight LLC | 1234567 | MC765432 | 42 | refrigerated_food, meat | (614) 555-0100 | Columbus | OH | active | 1000000 | 96 |
| Example Hauling Inc | 2345678 | MC876543 | 18 | general_freight, refrigerated_food | (419) 555-0142 | Toledo | OH | active | 750000 | 88 |

*(Illustrative rows.)* Every row also has:

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

## Pricing

You pay per carrier returned, plus a small fee per run. Set a maximum results number or a spending limit and the run stops there.

## Data and privacy

Only public registration data that carriers file with the US Department of Transportation. No company officer names, no cell phone numbers, no personal email addresses (only role mailboxes such as dispatch@ or safety@), and one-person registrations under a person's own name are left out. Nothing behind a login.

This Actor is independent and not affiliated with FMCSA or the US DOT. FMCSA data can lag by a few weeks; check the SAFER link before booking a load.

## Tips

- Whole-state searches with no fleet-size filter can match tens of thousands of carriers; set **Maximum results** or a minimum fleet size.
- Run it on a schedule with **Maximum years registered = 1** and **Sort by newest** to get new trucking companies every week.
- National averages to compare against: vehicle out-of-service rate about 22%, driver out-of-service rate about 6%.
