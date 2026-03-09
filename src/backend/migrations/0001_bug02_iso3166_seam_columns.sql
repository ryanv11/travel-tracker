ALTER TABLE `map_shading_config` ADD `subscription_id` text;--> statement-breakpoint
ALTER TABLE `regions` ADD `iso_3166_2` text NOT NULL DEFAULT 'XX-UNKNOWN';--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_regions_iso_3166_2` ON `regions` (`iso_3166_2`);--> statement-breakpoint
ALTER TABLE `trip_places` ADD `created_by_account_id` text;--> statement-breakpoint
ALTER TABLE `trips` ADD `owner_account_id` text;--> statement-breakpoint
ALTER TABLE `trips` ADD `subscription_id` text;--> statement-breakpoint
ALTER TABLE `trips` ADD `created_by_account_id` text;--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-AL' WHERE country_code = 'US' AND name = 'Alabama';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-AK' WHERE country_code = 'US' AND name = 'Alaska';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-AZ' WHERE country_code = 'US' AND name = 'Arizona';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-AR' WHERE country_code = 'US' AND name = 'Arkansas';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-CA' WHERE country_code = 'US' AND name = 'California';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-CO' WHERE country_code = 'US' AND name = 'Colorado';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-CT' WHERE country_code = 'US' AND name = 'Connecticut';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-DE' WHERE country_code = 'US' AND name = 'Delaware';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-DC' WHERE country_code = 'US' AND name = 'District of Columbia';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-FL' WHERE country_code = 'US' AND name = 'Florida';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-GA' WHERE country_code = 'US' AND name = 'Georgia';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-HI' WHERE country_code = 'US' AND name = 'Hawaii';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-ID' WHERE country_code = 'US' AND name = 'Idaho';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-IL' WHERE country_code = 'US' AND name = 'Illinois';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-IN' WHERE country_code = 'US' AND name = 'Indiana';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-IA' WHERE country_code = 'US' AND name = 'Iowa';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-KS' WHERE country_code = 'US' AND name = 'Kansas';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-KY' WHERE country_code = 'US' AND name = 'Kentucky';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-LA' WHERE country_code = 'US' AND name = 'Louisiana';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-ME' WHERE country_code = 'US' AND name = 'Maine';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-MD' WHERE country_code = 'US' AND name = 'Maryland';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-MA' WHERE country_code = 'US' AND name = 'Massachusetts';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-MI' WHERE country_code = 'US' AND name = 'Michigan';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-MN' WHERE country_code = 'US' AND name = 'Minnesota';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-MS' WHERE country_code = 'US' AND name = 'Mississippi';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-MO' WHERE country_code = 'US' AND name = 'Missouri';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-MT' WHERE country_code = 'US' AND name = 'Montana';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-NE' WHERE country_code = 'US' AND name = 'Nebraska';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-NV' WHERE country_code = 'US' AND name = 'Nevada';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-NH' WHERE country_code = 'US' AND name = 'New Hampshire';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-NJ' WHERE country_code = 'US' AND name = 'New Jersey';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-NM' WHERE country_code = 'US' AND name = 'New Mexico';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-NY' WHERE country_code = 'US' AND name = 'New York';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-NC' WHERE country_code = 'US' AND name = 'North Carolina';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-ND' WHERE country_code = 'US' AND name = 'North Dakota';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-OH' WHERE country_code = 'US' AND name = 'Ohio';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-OK' WHERE country_code = 'US' AND name = 'Oklahoma';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-OR' WHERE country_code = 'US' AND name = 'Oregon';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-PA' WHERE country_code = 'US' AND name = 'Pennsylvania';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-RI' WHERE country_code = 'US' AND name = 'Rhode Island';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-SC' WHERE country_code = 'US' AND name = 'South Carolina';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-SD' WHERE country_code = 'US' AND name = 'South Dakota';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-TN' WHERE country_code = 'US' AND name = 'Tennessee';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-TX' WHERE country_code = 'US' AND name = 'Texas';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-UT' WHERE country_code = 'US' AND name = 'Utah';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-VT' WHERE country_code = 'US' AND name = 'Vermont';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-VA' WHERE country_code = 'US' AND name = 'Virginia';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-WA' WHERE country_code = 'US' AND name = 'Washington';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-WV' WHERE country_code = 'US' AND name = 'West Virginia';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-WI' WHERE country_code = 'US' AND name = 'Wisconsin';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'US-WY' WHERE country_code = 'US' AND name = 'Wyoming';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'AU-NSW' WHERE country_code = 'AU' AND name = 'New South Wales';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'AU-VIC' WHERE country_code = 'AU' AND name = 'Victoria';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'AU-QLD' WHERE country_code = 'AU' AND name = 'Queensland';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'AU-SA' WHERE country_code = 'AU' AND name = 'South Australia';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'AU-WA' WHERE country_code = 'AU' AND name = 'Western Australia';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'AU-TAS' WHERE country_code = 'AU' AND name = 'Tasmania';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'AU-ACT' WHERE country_code = 'AU' AND name = 'Australian Capital Territory';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'AU-NT' WHERE country_code = 'AU' AND name = 'Northern Territory';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'CA-ON' WHERE country_code = 'CA' AND name = 'Ontario';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'CA-QC' WHERE country_code = 'CA' AND name = 'Quebec';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'CA-BC' WHERE country_code = 'CA' AND name = 'British Columbia';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'CA-AB' WHERE country_code = 'CA' AND name = 'Alberta';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'CA-MB' WHERE country_code = 'CA' AND name = 'Manitoba';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'CA-SK' WHERE country_code = 'CA' AND name = 'Saskatchewan';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'CA-NS' WHERE country_code = 'CA' AND name = 'Nova Scotia';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'CA-NB' WHERE country_code = 'CA' AND name = 'New Brunswick';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'CA-NL' WHERE country_code = 'CA' AND name = 'Newfoundland and Labrador';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'CA-PE' WHERE country_code = 'CA' AND name = 'Prince Edward Island';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'CA-NT' WHERE country_code = 'CA' AND name = 'Northwest Territories';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'CA-YT' WHERE country_code = 'CA' AND name = 'Yukon';--> statement-breakpoint
UPDATE regions SET iso_3166_2 = 'CA-NU' WHERE country_code = 'CA' AND name = 'Nunavut';
