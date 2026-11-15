// Small hand-made records in the shape the FMCSA datasets return.

export function censusRow(over = {}) {
    return {
        dot_number: '14762',
        legal_name: 'MILK TRANSPORTATION LLC',
        dba_name: 'MILK TRANSPORTATION LLC',
        status_code: 'A',
        carrier_operation: 'A',
        classdef: 'PRIVATE PROPERTY;AUTHORIZED FOR HIRE',
        carship: 'C;B',
        business_org_desc: 'CORPORATION',
        phone: '7403250069',
        fax: '7403250070',
        email_address: 'Dispatch@MilkTransport.com',
        phy_street: '300 NORTH 5TH STREET ',
        phy_city: 'MARTINS FERRY',
        phy_state: 'OH',
        phy_zip: '43935-1234',
        phy_country: 'US',
        power_units: '198',
        truck_units: '20',
        total_drivers: '210',
        total_cdl: '205',
        owntruck: '10',
        owntract: '150',
        owntrail: '300',
        trmtract: '30',
        mcs150_date: '20260318',
        mcs150_mileage: '19000000',
        mcs150_mileage_year: '2025',
        add_date: '19980601',
        hm_ind: 'N',
        safety_rating: 'S',
        safety_rating_date: '20190105',
        docket1prefix: 'MC',
        docket1: '0491205',
        docket1_status_code: 'A',
        crgo_coldfood: 'X',
        crgo_genfreight: 'X',
        crgo_cargoothr: 'X',
        crgo_cargoothr_desc: 'MILK',
        ...over,
    };
}

export const authorityRows = [
    { docket_number: 'MC491205', dot_number: '00014762', common_stat: 'N', contract_stat: 'A', broker_stat: 'N', common_app_pend: 'N', contract_app_pend: 'N', broker_app_pend: 'N', bipd_file: '01000', min_cov_amount: '00750', cargo_file: 'Y' },
    { docket_number: 'MC12892', dot_number: '00000999', common_stat: 'I', contract_stat: 'N', broker_stat: 'I', bipd_file: '00000', min_cov_amount: '00000', cargo_file: 'N' },
];

export const smsRow = {
    dot_number: '14762', insp_total: '120', driver_insp_total: '110', driver_oos_insp_total: '4', vehicle_insp_total: '80',
    vehicle_oos_insp_total: '10', unsafe_driv_ac: 'N', hos_driv_ac: 'Y', driv_fit_ac: 'N', contr_subst_ac: 'N', veh_maint_ac: 'N',
};
