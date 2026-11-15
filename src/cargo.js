// Cargo types a carrier ticks on its FMCSA registration (form MCS-150).
// id -> census column and a plain label.

export const CARGO = {
    general_freight: { field: 'crgo_genfreight', label: 'General freight' },
    refrigerated_food: { field: 'crgo_coldfood', label: 'Refrigerated food' },
    fresh_produce: { field: 'crgo_produce', label: 'Fresh produce' },
    meat: { field: 'crgo_meat', label: 'Meat' },
    beverages: { field: 'crgo_beverages', label: 'Beverages' },
    paper_products: { field: 'crgo_paperprod', label: 'Paper products' },
    household_goods: { field: 'crgo_household', label: 'Household goods (movers)' },
    metal_coils: { field: 'crgo_metalsheet', label: 'Metal: sheets, coils, rolls' },
    building_materials: { field: 'crgo_bldgmat', label: 'Building materials' },
    machinery_large_objects: { field: 'crgo_machlrg', label: 'Machinery, large objects' },
    logs_poles_lumber: { field: 'crgo_logpole', label: 'Logs, poles, beams, lumber' },
    construction: { field: 'crgo_construct', label: 'Construction' },
    motor_vehicles: { field: 'crgo_motoveh', label: 'Motor vehicles (car haulers)' },
    driveaway_towaway: { field: 'crgo_drivetow', label: 'Drive away / tow away' },
    mobile_homes: { field: 'crgo_mobilehome', label: 'Mobile homes' },
    intermodal_containers: { field: 'crgo_intermodal', label: 'Intermodal containers' },
    liquids_gases: { field: 'crgo_liqgas', label: 'Liquids, gases (tankers)' },
    chemicals: { field: 'crgo_chem', label: 'Chemicals' },
    dry_bulk: { field: 'crgo_drybulk', label: 'Commodities dry bulk' },
    oilfield_equipment: { field: 'crgo_oilfield', label: 'Oilfield equipment' },
    coal_coke: { field: 'crgo_coalcoke', label: 'Coal, coke' },
    grain_feed_hay: { field: 'crgo_grainfeed', label: 'Grain, feed, hay' },
    livestock: { field: 'crgo_livestock', label: 'Livestock' },
    farm_supplies: { field: 'crgo_farmsupp', label: 'Agricultural, farm supplies' },
    garbage_refuse: { field: 'crgo_garbage', label: 'Garbage, refuse, trash' },
    us_mail: { field: 'crgo_usmail', label: 'US mail' },
    utilities: { field: 'crgo_utility', label: 'Utilities' },
    water_well: { field: 'crgo_waterwell', label: 'Water well' },
    passengers: { field: 'crgo_passengers', label: 'Passengers' },
};

export const CARGO_IDS = Object.keys(CARGO);

/** Cargo ids ticked on a census record. */
export function cargoOf(rec) {
    return CARGO_IDS.filter((id) => rec[CARGO[id].field] === 'X');
}
