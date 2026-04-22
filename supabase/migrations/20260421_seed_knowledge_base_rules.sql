-- SATORI Knowledge Base Rules — Domain 1: FMCSA & DOT Compliance
-- 26 rules extracted from domain-01-fmcsa-dot-compliance.pdf
-- Idempotent via ON CONFLICT (rule_id) DO NOTHING.

CREATE TABLE IF NOT EXISTS knowledge_base_rules (
  rule_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  domain TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  description TEXT NOT NULL,
  detection_signals TEXT[],
  violation_criteria TEXT NOT NULL,
  regulatory_source TEXT,
  recommended_action TEXT NOT NULL,
  escalation_path TEXT NOT NULL,
  related_rules TEXT[],
  is_template BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HOS-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'HOS-001',
  '11-Hour Driving Limit Exceeded',
  'fmcsa_dot_compliance',
  'critical',
  'Property-carrying CMV drivers may not drive more than 11 hours after 10 consecutive hours off-duty. Driving beyond 11 hours is an automatic out-of-service offense at roadside and a high-severity CSA violation that stays in SMS for 24 months. Dispatchers must stop assigning loads when a driver is approaching the 11-hour ceiling.',
  ARRAY['11 hours','out of hours','over driving time','maxed out drive time','can I push it','few more miles','one more hour','ran out of clock'],
  'Cumulative driving time in the current duty tour exceeds 11.0 hours without a prior 10-consecutive-hour off-duty or qualifying sleeper-berth reset.',
  '49 CFR §395.3(a)(3)(i); CVSA North American Standard Out-of-Service Criteria, Part II.',
  'Instruct dispatch to immediately route the driver to the nearest safe parking and hold the load. Do not authorize any additional driving until 10 consecutive hours off-duty are completed. Document the stop location and ELD record.',
  'dispatch → safety',
  ARRAY['HOS-002','HOS-003','HOS-004','HOS-005','ELD-001','CSA-001','OOS-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- HOS-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'HOS-002',
  '14-Hour Driving Window Violation',
  'fmcsa_dot_compliance',
  'high',
  'A driver may not drive after the 14th consecutive hour following coming on duty, even if driving hours remain under the 11-hour cap. The 14-hour clock cannot be extended by off-duty time except under the sleeper-berth split or adverse-conditions exception. Detention at shippers/receivers is the most common cause.',
  ARRAY['14 hour clock','window closed','14 hours up','detention ate my clock','stuck at the shipper','out of hours at dock','can''t make delivery','clock expired'],
  'Any driving movement logged after 14 consecutive hours have elapsed from the driver''s first on-duty status change in the current tour, with no qualifying sleeper-berth split under §395.1(g) or adverse conditions declaration under §395.1(b).',
  '49 CFR §395.3(a)(2).',
  'Terminate driving immediately, stage the truck in a safe location, and log remaining time as off-duty/sleeper. If detention at a facility caused the violation, file a detention-time record and evaluate whether an adverse-conditions exception applies before any further movement.',
  'dispatch → safety → operations',
  ARRAY['HOS-001','HOS-003','HOS-005','HOS-006','CSA-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- HOS-003
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'HOS-003',
  '30-Minute Break Missed After 8 Cumulative Driving Hours',
  'fmcsa_dot_compliance',
  'high',
  'Drivers must take a consecutive 30-minute interruption of driving (off-duty, sleeper, or on-duty-not-driving) after 8 cumulative hours of driving. The 2020 final rule replaced the old 8-hour on-duty trigger with an 8-hour driving trigger and allows on-duty-not-driving to satisfy the break. Short-haul drivers under §395.1(e)(1)/(2) are exempt.',
  ARRAY['no break','skip lunch','push through','no time to stop','8 hours straight','didn''t take my 30','keep rolling','break required'],
  'Driver accumulates more than 8 hours of driving time since the last qualifying 30-minute (or longer) non-driving interruption, and driver is not operating under a §395.1(e) short-haul exception.',
  '49 CFR §395.3(a)(3)(ii); 85 FR 33396 (June 1, 2020 HOS Final Rule).',
  'Direct the driver to take the 30-minute break at the next safe location before resuming driving. Verify the break is logged correctly on the ELD.',
  'dispatch → safety',
  ARRAY['HOS-001','HOS-002','HOS-007','ELD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- HOS-004
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'HOS-004',
  '60/70-Hour Weekly On-Duty Limit Exceeded',
  'fmcsa_dot_compliance',
  'high',
  'Drivers may not drive after being on-duty 60 hours in 7 consecutive days (carrier does not operate every day) or 70 hours in 8 consecutive days (carrier operates every day). A 34-consecutive-hour off-duty period resets the weekly clock. This is the most common cause of chronic fatigue flags in SMS.',
  ARRAY['70 hour','60 hour','weekly recap','need a restart','34 hour reset','over on the week','no hours left','recap won''t work'],
  'Driver''s cumulative on-duty time (driving + on-duty-not-driving) reaches or exceeds 60 hours in any 7-day rolling window (6-day carrier) or 70 hours in any 8-day rolling window (7-day carrier) with no intervening 34-hour restart.',
  '49 CFR §395.3(b); 49 CFR §395.3(c) (34-hour restart).',
  'Pull the driver off the board and schedule a 34-consecutive-hour restart, or rebalance loads so remaining recap hours cover the next assignment. Do not dispatch until weekly recap shows available hours.',
  'dispatch → safety',
  ARRAY['HOS-001','HOS-002','HOS-005','CSA-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- HOS-005
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'HOS-005',
  'Sleeper-Berth Split Misuse',
  'fmcsa_dot_compliance',
  'medium',
  'Under the 2020 HOS rule, drivers may split the required 10 hours off-duty into two periods using a 7/3 or 8/2 split, provided one period is at least 7 consecutive hours in the sleeper berth, the other is at least 2 hours (off-duty or sleeper), and the two total at least 10 hours. Incorrect splits invalidate the reset and create downstream 11/14-hour violations.',
  ARRAY['sleeper split','7/3 split','8/2 split','split berth','partial rest','short sleeper','only 6 hours in bunk','didn''t reset'],
  'Driver resumes driving after a sleeper-berth split where (a) neither period meets the 2-hour minimum, (b) no period meets the 7-consecutive-hour sleeper minimum, (c) combined time is under 10 hours, or (d) post-split recalculation shows >11 hours driving or >14-hour duty window in the paired windows.',
  '49 CFR §395.1(g)(1); 85 FR 33396 (June 1, 2020).',
  'Verify both split segments on the ELD and recalculate the 11/14-hour clocks from the end of the first qualifying rest period. If the split is invalid, hold the driver for a full 10-consecutive-hour reset.',
  'dispatch → safety',
  ARRAY['HOS-001','HOS-002','ELD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- HOS-006
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'HOS-006',
  'Adverse Driving Conditions Exception Misapplied',
  'fmcsa_dot_compliance',
  'medium',
  'The adverse-conditions exception extends both the 11-hour driving limit and the 14-hour window by up to 2 hours when unforeseen weather, traffic, or road conditions encountered after dispatch make safe completion impossible. It cannot be used for conditions known before the trip began (forecasted snow, known construction). Misuse is a common post-inspection audit finding.',
  ARRAY['adverse conditions','unexpected snow','road closed','use the 2 hour','extend my clock','weather delay','traffic jam exception','fog delay'],
  'Driver invokes §395.1(b) to exceed 11 driving hours or the 14-hour window for conditions that were (a) known or forecast prior to dispatch, (b) routine congestion, or (c) loading/unloading delays; or extension exceeds 2 hours.',
  '49 CFR §395.1(b)(1).',
  'Confirm dispatcher did not know of the condition at dispatch time, document the specific adverse event with timestamp and location in the ELD annotation, and cap the extension at 2 hours. If the condition was foreseeable, revoke the exception and route the driver to safe parking.',
  'dispatch → safety',
  ARRAY['HOS-001','HOS-002','ELD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- HOS-007
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'HOS-007',
  'Short-Haul Exception Boundary Breach',
  'fmcsa_dot_compliance',
  'medium',
  'The 150 air-mile short-haul exception exempts a driver from RODS/ELD and the 30-minute break requirement if the driver operates within a 150 air-mile radius of the normal work-reporting location and returns within 14 hours. Crossing either boundary without reverting to full HOS logging creates a falsification violation.',
  ARRAY['150 air mile','short haul','local run','day cab','out of the radius','running long today','over 14','need to go on ELD'],
  'Driver operating under §395.1(e)(1) exceeds the 150 air-mile radius OR the 14-hour return window OR fails to have at least 10 consecutive hours off-duty between 14-hour tours, without creating a compliant ELD record for that day.',
  '49 CFR §395.1(e)(1); 85 FR 33396 (radius expanded from 100 to 150 air miles).',
  'As soon as dispatch knows the driver will exceed 150 air miles or 14 hours, instruct the driver to activate full ELD logging for that duty tour and preserve prior time records for 6 months per §395.1(e)(1)(iv).',
  'dispatch → safety',
  ARRAY['HOS-003','ELD-001','ELD-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- ELD-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'ELD-001',
  'ELD Malfunction Not Corrected Within 8 Days',
  'fmcsa_dot_compliance',
  'high',
  'When an ELD malfunctions, the driver must immediately note the malfunction, reconstruct RODS on paper for the current day plus 7 prior days, and the carrier must repair/replace the device within 8 days of discovery. Operating beyond 8 days with a malfunctioning ELD is an acute violation that triggers investigation.',
  ARRAY['ELD not working','device malfunction','screen is dead','won''t sync','paper logs','ELD error code','device broken','logging on paper'],
  'More than 8 calendar days have elapsed since ELD malfunction was first identified, and the device has not been repaired, replaced, or the driver has not been transitioned to another compliant ELD; OR driver has not maintained paper RODS during the malfunction period.',
  '49 CFR §395.34(a)-(b); 49 CFR §395.22(h).',
  'Open a repair ticket with the ELD vendor immediately, issue the driver paper logs for the current and 7 prior days, and if 8 days will be exceeded, request a written extension from the FMCSA Division Administrator per §395.34(b)(2) before day 8.',
  'dispatch → safety → operations',
  ARRAY['HOS-001','HOS-002','ELD-002','INSP-003'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- ELD-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'ELD-002',
  'Unidentified Driving Events Over 30-Minute Threshold',
  'fmcsa_dot_compliance',
  'medium',
  'ELDs record all vehicle motion; any driving not associated with a logged-in driver accrues as "unidentified driving time" on the carrier''s back-office account. FMCSA expects carriers to review and assign or annotate these events; excessive unassigned driving is a leading indicator of log falsification and a top Compliance Review finding.',
  ARRAY['unidentified driving','unassigned miles','who was driving','ghost driving','yard move mistake','not my log','mechanic drove it','someone moved the truck'],
  'Any single unidentified driving event exceeds 30 minutes or 5 miles, OR total unidentified driving on the carrier account exceeds 0.5% of total driving time in a 7-day rolling window, without documented assignment or annotation.',
  '49 CFR §395.32; FMCSA ELD Rule 80 FR 78292 (Dec 16, 2015).',
  'Safety manager must review the unidentified event log daily, assign events to the correct driver or annotate as yard-move/shop-movement with the technician''s name, and resolve all events within 24 hours.',
  'safety → operations',
  ARRAY['ELD-001','HOS-001','CSA-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- INSP-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'INSP-001',
  'Level 1 Inspection OOS Violation Detected',
  'fmcsa_dot_compliance',
  'critical',
  'CVSA Level 1 is the 37-step North American Standard Inspection covering driver credentials, HOS, ELD, and a full mechanical inspection. Any violation meeting the CVSA Out-of-Service Criteria (e.g., defective brakes on 20%+ of service brakes, steering component failure, tire with ply/belt exposure) places the driver/vehicle OOS at roadside.',
  ARRAY['level 1 inspection','full inspection','put OOS','out of service','red sticker','DOT stop','scale house inspection','CVSA sticker'],
  'Roadside Level 1 inspection results in any violation listed in the current CVSA North American Standard Out-of-Service Criteria handbook, producing an OOS determination for driver, vehicle, or both.',
  '49 CFR §396.9; CVSA North American Standard Out-of-Service Criteria (2024 edition); FMCSA Inspection Procedure (Level 1).',
  'Do not move the vehicle until the specific defect is repaired AND a qualified mechanic signs off AND the OOS sticker is lifted by enforcement or the repair is documented per §396.9(d)(3). File the inspection report in the DQ/vehicle file within 24 hours.',
  'dispatch → safety → operations → ownership',
  ARRAY['INSP-002','INSP-003','OOS-001','CSA-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- INSP-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'INSP-002',
  'Pre-Trip / Post-Trip Inspection Not Performed',
  'fmcsa_dot_compliance',
  'high',
  'Before driving, drivers must be satisfied that required parts/accessories are in good working order (pre-trip, §392.7). At the end of each driving day, drivers must prepare a written Driver Vehicle Inspection Report (DVIR) identifying any defect that would affect safe operation; the carrier must repair defects before next dispatch and retain DVIRs for 3 months.',
  ARRAY['no pre-trip','skipped inspection','no DVIR','didn''t walk around','forgot post-trip','no defect report','truck wasn''t checked','left the yard'],
  'No pre-trip review documented or ELD/DVIR shows <1 minute duration for pre-trip; OR no DVIR submitted after any 24-hour period during which the vehicle was operated; OR a reported defect affecting safe operation was not corrected/certified before the next dispatch.',
  '49 CFR §392.7 (pre-trip); 49 CFR §396.11 (DVIR); 49 CFR §396.13 (driver inspection).',
  'Require the driver to complete and submit the missing DVIR immediately, have a qualified mechanic inspect any reported defect, and document repair certification before the next dispatch. Coach the driver and log in DQ file.',
  'dispatch → safety',
  ARRAY['INSP-001','INSP-003','CSA-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- INSP-003
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'INSP-003',
  'Annual Periodic Inspection Past Due',
  'fmcsa_dot_compliance',
  'high',
  'Every CMV must pass a periodic inspection at least once every 12 months meeting the minimum standards in 49 CFR Part 396 Appendix A. The inspection decal/report must be retained for 14 months and the original inspection report for 14 months from the report date. Expired annuals are an acute violation that grounds the unit.',
  ARRAY['annual inspection','DOT annual','inspection sticker expired','overdue annual','needs DOT','no annual on file','sticker expired','past due inspection'],
  'Any power unit or trailer operated in interstate commerce whose most recent periodic inspection was completed more than 12 months ago based on the date on the inspection report.',
  '49 CFR §396.17; 49 CFR §396.21; 49 CFR Part 396 Appendix A (minimum standards).',
  'Pull the unit out of service immediately, schedule the periodic inspection with a qualified inspector per §396.19, and do not return to service until a signed inspection report is on file. Update fleet maintenance tracker.',
  'safety → operations',
  ARRAY['INSP-001','INSP-002','CSA-002','OOS-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- MED-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'MED-001',
  'CDL Medical Certificate Expired or Missing',
  'fmcsa_dot_compliance',
  'critical',
  'Interstate CMV drivers must hold a valid Medical Examiner''s Certificate (MCSA-5876) issued by an examiner on the National Registry of Certified Medical Examiners. The certificate is valid up to 24 months (shorter for certain conditions such as hypertension or diabetes). An expired med card makes the driver unqualified under §391.41 and the CDL non-certified under state MVR, triggering immediate downgrade.',
  ARRAY['med card expired','DOT physical','need a physical','medical certificate','lost med card','physical due','no DOT card','doctor appointment'],
  'Driver operating a CMV with (a) no valid MCSA-5876 on file, (b) an MCSA-5876 issued by an examiner not listed on the National Registry at time of exam, or (c) a certificate whose expiration date has passed based on the driver''s date of dispatch.',
  '49 CFR §391.41; 49 CFR §391.43; 49 CFR §391.45 (periodic exam); 49 CFR §383.71(h) (self-certification).',
  'Remove the driver from all safety-sensitive duty immediately. Schedule a DOT physical with a National Registry examiner, verify results on the Registry website, and confirm the state DMV has received the updated certificate before returning the driver to duty.',
  'safety → HR → operations',
  ARRAY['DRUG-001','CSA-001','AUTH-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- DRUG-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DRUG-001',
  'Pre-Employment Drug Test Not Completed or Not Negative',
  'fmcsa_dot_compliance',
  'critical',
  'Every driver in a safety-sensitive position must have a verified negative DOT pre-employment controlled-substances test before performing any safety-sensitive function. In 2026 the FMCSA random rate remains 50% for drugs and 10% for alcohol. A missing or non-negative pre-employment test is an acute Compliance Review violation.',
  ARRAY['pre-employment test','new hire drug test','first day','start driving','MRO results','positive result','dilute specimen','refused test'],
  'Driver dispatched to safety-sensitive function without (a) a documented verified-negative pre-employment controlled-substances test result, (b) a completed Clearinghouse full query with negative result, or (c) documented exception under §382.301(b).',
  '49 CFR §382.301; 49 CFR §382.701(a); DOT ODAPC 2026 Random Testing Rate Notice (50% drug / 10% alcohol).',
  'Immediately stop the dispatch. Send the driver to a certified collection site for the pre-employment test, complete the Clearinghouse full query, and do not authorize safety-sensitive work until a verified negative is on file.',
  'safety → HR → operations',
  ARRAY['DRUG-002','CLEAR-001','MED-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- DRUG-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DRUG-002',
  'Post-Accident Drug/Alcohol Test Window Missed',
  'fmcsa_dot_compliance',
  'critical',
  'A DOT post-accident test is required after any accident involving (1) a human fatality, (2) bodily injury with immediate medical treatment away from the scene AND a citation to the CMV driver, or (3) disabling damage requiring tow-away AND a citation to the CMV driver. Alcohol must be tested within 8 hours; drugs within 32 hours. Missing the window requires a written explanation in the driver file.',
  ARRAY['accident','crash','hit and run','rear end','fatality','tow truck','ambulance','citation issued','post accident test'],
  'Qualifying accident per §382.303(a) occurred and (a) alcohol test not administered within 8 hours, (b) drug test not administered within 32 hours, or (c) neither test conducted and no §382.303(d) written explanation on file.',
  '49 CFR §382.303; 49 CFR §382.303(d) (timing and documentation).',
  'Determine within minutes whether the accident meets §382.303(a) criteria; if yes, send the driver to the nearest DOT collection site and document times. If windows are missed, prepare a §382.303(d) written explanation the same day and preserve all dispatch, police, and medical records.',
  'dispatch → safety → ownership → HR',
  ARRAY['DRUG-001','CLEAR-001','OOS-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- CLEAR-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'CLEAR-001',
  'Clearinghouse Query Missing or Driver in Prohibited Status',
  'fmcsa_dot_compliance',
  'critical',
  'Carriers must conduct a full Clearinghouse query pre-employment and a limited query annually on every CDL driver. Since November 18, 2024 (Clearinghouse-II compliance date, 86 FR 55718), State Driver Licensing Agencies must downgrade the CDL of any driver in prohibited status within 60 days, and employers must report violations within 3 business days. A driver with prohibited status cannot operate any CMV.',
  ARRAY['clearinghouse query','annual query','prohibited status','return to duty','SAP evaluation','positive result','license downgrade','not prohibited'],
  'Any CDL driver dispatched without (a) a pre-employment full query within the last 30 days of hire, (b) an annual limited query in the last 365 days, or (c) whose Clearinghouse status is "prohibited" at time of dispatch; OR a reportable violation not uploaded within 3 business days.',
  '49 CFR §382.701(a) & (b); 49 CFR §382.705(b); 49 CFR §383.73(q); 86 FR 55718 (Clearinghouse-II, effective Nov 18, 2024).',
  'Run the missing query immediately through the Clearinghouse portal; if status is prohibited, pull the driver from all safety-sensitive duty and refer to a DOT-qualified Substance Abuse Professional (SAP) to begin the §40 Subpart O return-to-duty process.',
  'safety → HR → ownership',
  ARRAY['DRUG-001','DRUG-002','MED-001','AUTH-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- CSA-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'CSA-001',
  'HOS Compliance BASIC Above 65% Intervention Threshold',
  'fmcsa_dot_compliance',
  'high',
  'FMCSA''s Safety Measurement System ranks carriers in 7 BASICs. The Unsafe Driving, Crash Indicator, and HOS Compliance BASICs trigger intervention at the 65th percentile for general property carriers (60% for hazmat, 50% for passenger). Crossing the threshold generates a warning letter, prioritized roadside inspections, and potentially an off-site or on-site investigation.',
  ARRAY['CSA score','BASIC percentile','warning letter','above threshold','HOS compliance','intervention','SMS alert','DOT audit letter'],
  'Carrier''s monthly SMS percentile in the HOS Compliance, Unsafe Driving, or Crash Indicator BASIC reaches or exceeds 65% (general property), 60% (HM), or 50% (passenger) for any reporting period.',
  'FMCSA SMS Methodology v. current; 49 CFR §385 Subpart D (intervention); FMCSA CSA Program (enforced under 49 USC §31133).',
  'Pull the SMS BASIC report, identify the top 5 driver/violation combinations driving the score, launch targeted coaching, dispute inaccurate records via DataQs within 30 days, and prepare a written Cooperative Safety Plan if a warning letter is received.',
  'safety → operations → ownership',
  ARRAY['HOS-001','HOS-002','HOS-003','HOS-004','CSA-002','OOS-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- CSA-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'CSA-002',
  'Vehicle Maintenance BASIC Above 80% Intervention Threshold',
  'fmcsa_dot_compliance',
  'high',
  'The Vehicle Maintenance, Controlled Substances/Alcohol, Driver Fitness, and HM Compliance BASICs trigger intervention at the 80th percentile for general property carriers (75% HM, 65% passenger for the non-HM categories). Brake, light, and tire violations make up over 60% of roadside maintenance citations and drive this BASIC.',
  ARRAY['vehicle maintenance BASIC','brake violation','lights out','tire violation','maintenance score','80 percent','roadside mechanical','CVSA defect'],
  'Carrier''s monthly SMS percentile in the Vehicle Maintenance, Driver Fitness, or Controlled Substances/Alcohol BASIC reaches or exceeds 80% (general property), 75% (HM), or 65% (passenger).',
  'FMCSA SMS Methodology; 49 CFR §396 (inspection, repair, maintenance); 49 CFR §385.13 (unsatisfactory safety rating).',
  'Order a full fleet preventive-maintenance audit, prioritize brake adjustment (top-cited violation), lights, and tires. Retrain drivers on pre-trip inspection. File DataQs challenges on any inspection where no violation was actually cited to the carrier.',
  'safety → operations → ownership',
  ARRAY['INSP-001','INSP-002','INSP-003','CSA-001','OOS-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- HAZ-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'HAZ-001',
  'Hazmat Placarding Below Required Threshold',
  'fmcsa_dot_compliance',
  'critical',
  'Any bulk packaging and any non-bulk shipment of Table 1 materials (Div. 1.1–1.3 explosives, 2.3 toxic gas, 4.3 dangerous when wet, certain 5.2 organic peroxides, 6.1 PIH, certain Class 7 radioactive) must be placarded regardless of quantity. Non-bulk Table 2 materials require placards when aggregate gross weight reaches 1,001 lb (454 kg). Unplacarded hazmat is an automatic OOS condition.',
  ARRAY['hazmat load','placard','UN number','class 3','flammable','corrosive','shipping papers','no placards','dangerous placard'],
  'Vehicle transports (a) any quantity of Table 1 hazmat without the specified placards on all four sides, (b) 1,001 lb or more aggregate gross weight of Table 2 hazmat in non-bulk without placards, or (c) a bulk packaging without placards regardless of quantity.',
  '49 CFR §172.504(a), (c), (e) (Tables 1 & 2); 49 CFR §177.823; CVSA OOS Criteria Part III (Hazmat).',
  'Stop the vehicle immediately, verify shipping papers and UN IDs, apply correct placards on all four sides before any further movement, and confirm the driver has the HM endorsement and current shipping papers in the cab per §177.817.',
  'dispatch → safety → operations',
  ARRAY['HAZ-002','INSP-001','OOS-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- HAZ-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'HAZ-002',
  'Hazmat Driver Endorsement or Routing Violation',
  'fmcsa_dot_compliance',
  'high',
  'Drivers transporting placardable quantities of hazmat must hold a CDL Hazardous Materials (H) endorsement, which requires TSA Security Threat Assessment (fingerprinting) renewed every 5 years. Certain materials (Class 7 Highway Route Controlled Quantity radioactive, Class 1.1–1.3 explosives over 55 lb net, select PIH) require a written route plan and must use designated preferred routes.',
  ARRAY['H endorsement','hazmat endorsement','TSA fingerprint','route plan','preferred route','tunnel restriction','NRC material','HMR routing'],
  'Driver transporting placardable hazmat without a valid H endorsement (or N tanker endorsement where required); OR transporting Class 7 HRCQ, Class 1.1–1.3 explosives >55 lb net, or Class 6.1 PIH Zone A without a written route plan carried in the vehicle; OR deviating from the designated/preferred route without documented justification.',
  '49 CFR §383.93(b)(4) (H endorsement); 49 CFR §1572 (TSA STA, 5-year renewal); 49 CFR §397.67 (route plan); 49 CFR §397.101 (radioactive routing).',
  'Verify the driver''s CDL endorsements and TSA Threat Assessment expiration in the DQ file before any hazmat dispatch. For routed materials, generate a written route plan using state-designated routes and keep a copy in the cab and at the dispatch office.',
  'dispatch → safety → operations',
  ARRAY['HAZ-001','MED-001','CLEAR-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- IFTA-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'IFTA-001',
  'IFTA Quarterly Return Late or Missing',
  'fmcsa_dot_compliance',
  'medium',
  'Carriers operating qualified motor vehicles (>26,000 lb GVWR or 3+ axles) in two or more IFTA jurisdictions must file quarterly fuel-tax returns by the last day of the month following quarter end: Q1 (Apr 30), Q2 (Jul 31), Q3 (Oct 31), Q4 (Jan 31). Late filing triggers a penalty of $50 or 10% of net tax due (whichever is greater) plus interest per jurisdiction, and repeat lateness can result in license revocation.',
  ARRAY['IFTA return','fuel tax','quarterly filing','IFTA decals','jurisdiction miles','April 30','July 31','IFTA license'],
  'IFTA return not filed by the last day of the month following the close of the quarter, OR filed without full payment of net tax due, OR fleet operates without current IFTA license and two decals per qualified vehicle.',
  'IFTA Articles of Agreement R960 (penalty); IFTA Procedures Manual P510 (quarterly due dates); state IFTA statutes (base-jurisdiction enforcement).',
  'File the delinquent return immediately through the base-state portal, pay net tax plus $50/10% penalty and interest, and reconcile the carrier''s mileage/fuel records (retain 4 years per IFTA R820). Put quarterly deadlines in a compliance calendar with 15-day lead alerts.',
  'operations → ownership',
  ARRAY['IRP-001','UCR-001','AUTH-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- IRP-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'IRP-001',
  'IRP Apportioned Registration Expired or Not Updated',
  'fmcsa_dot_compliance',
  'high',
  'Qualified vehicles (>26,000 lb GVWR or 3+ axles) operating in two or more IRP jurisdictions must display an apportioned cab card and plate from the base jurisdiction. Registration is renewed annually based on the July 1 – June 30 reporting period, and any change in fleet, weight, or jurisdictions must be reported via supplemental application. Expired IRP is an OOS condition at roadside in most states.',
  ARRAY['apportioned plate','IRP renewal','cab card','registration expired','apportioned registration','trip permit','base plate','no cab card'],
  'Qualified vehicle operating interstate with (a) expired IRP cab card, (b) no cab card in the vehicle, (c) weight operated exceeds the weight declared on the cab card, or (d) jurisdiction entered that is not listed on the cab card without a trip permit.',
  'International Registration Plan, Article IV (qualified vehicle) & Article X (credentials); IRP Audit Procedures Manual §B (3 years + current year record retention).',
  'Pull the unit out of service, obtain a trip permit to move it if necessary, and file the IRP renewal or supplemental application with the base jurisdiction. Verify cab card weight/jurisdictions match actual operations before returning to service.',
  'operations → ownership',
  ARRAY['IFTA-001','UCR-001','AUTH-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- UCR-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'UCR-001',
  'UCR Registration Not Current for Filing Year',
  'fmcsa_dot_compliance',
  'medium',
  'Interstate motor carriers, brokers, freight forwarders, and leasing companies must register annually under the Unified Carrier Registration Agreement with their base state. The 2026 filing window opened October 1, 2025 with enforcement beginning January 1, 2026; fees are bracketed by fleet size under 49 CFR §367.50 (unchanged for 2026 per FMCSA''s June 2024 final rule, 89 FR 51276). Non-participating states still enforce UCR at roadside.',
  ARRAY['UCR','unified carrier','UCR registration','base state','UCR fee','fleet bracket','December 31','UCR compliance'],
  'Carrier operating in interstate commerce after January 1 of the registration year without a paid, current UCR registration on file with its base state, OR fleet size bracket (based on MCS-150 power-unit count) understated.',
  '49 USC §14504a (UCR Act); 49 CFR §367.50 (2026 fee schedule); 89 FR 51276 (June 17, 2024 final fee rule).',
  'File the UCR registration immediately at ucr.gov under the correct bracket (based on current MCS-150 power units), retain the payment confirmation, and align the MCS-150 biennial update before the next UCR year.',
  'operations → ownership',
  ARRAY['IFTA-001','IRP-001','AUTH-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- AUTH-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'AUTH-001',
  'Operating Authority / MCS-150 / BOC-3 Not Current',
  'fmcsa_dot_compliance',
  'critical',
  'For-hire interstate carriers must maintain an active USDOT number, MC (Operating Authority) number where required, BOC-3 designation of process agents, and the required insurance filings (BMC-91/91X, minimum $750,000 for general freight; $1M for oil/non-bulk hazmat; $5M for certain hazmat). The MCS-150 biennial update is due every 24 months by the last day of the month assigned by the last two digits of the USDOT number; failure to update leads to DOT number deactivation.',
  ARRAY['MC number','DOT number','operating authority','BOC-3','MCS-150','biennial update','insurance filing','authority revoked'],
  'Carrier operating with (a) inactive or revoked USDOT/MC number, (b) MCS-150 not updated within the assigned biennial window per §390.19T, (c) no BOC-3 on file, or (d) public liability insurance on file below the §387.9 minimum for the cargo type.',
  '49 CFR §390.19T (MCS-150 biennial update); 49 CFR §365 (authority); 49 CFR §366 (BOC-3); 49 CFR §387.9 (financial responsibility minimums).',
  'Check entity status in SAFER/L&I. File the missing MCS-150, BOC-3, or insurance form immediately through the FMCSA Portal or MOTUS (phased rollout mid-to-late 2026). Do not dispatch any for-hire load until authority is confirmed active and insurance is on file.',
  'operations → ownership',
  ARRAY['UCR-001','IRP-001','IFTA-001','OOS-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- OOS-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'OOS-001',
  'Roadside Out-of-Service Order Issued',
  'fmcsa_dot_compliance',
  'critical',
  'An OOS order requires that the driver or vehicle not operate until the condition causing the order is corrected. CVSA OOS categories include driver (HOS violations, no CDL, no med card, alcohol/drugs), vehicle (brakes, steering, tires, frame), and hazmat. Moving an OOS unit in violation of the order carries civil penalties up to $27,254 per violation (2025 FMCSA adjusted penalty) and is an acute violation.',
  ARRAY['OOS order','out of service','red sticker','grounded','inspector wrote us up','can''t move truck','OOS driver','OOS vehicle'],
  'Inspector issues an OOS order under 49 CFR §396.9(c) or §392.5 (alcohol/drugs) or CVSA OOS Criteria, and the driver or vehicle is moved, dispatched, or returned to service before the condition is corrected and documented per §396.9(d)(3).',
  '49 CFR §396.9(c)-(d); 49 CFR §392.5; CVSA North American Standard Out-of-Service Criteria; 49 CFR §386 Appendix B (penalties).',
  'Record the OOS order, inspection report number, and location. Arrange qualified repair on-site or tow, obtain written mechanic certification of repair, and have a company representative sign the back of the inspection report before any movement. Submit the form to FMCSA within 15 days.',
  'dispatch → safety → operations → ownership',
  ARRAY['INSP-001','INSP-002','INSP-003','HOS-001','HAZ-001','OOS-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- OOS-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'OOS-002',
  'Audit / Compliance Review Triggered by Violation Pattern',
  'fmcsa_dot_compliance',
  'critical',
  'FMCSA triggers a New Entrant Safety Audit within 12 months of issuing a DOT number (§385.321), and a Compliance Review / focused investigation when a carrier exceeds BASIC intervention thresholds for 4 consecutive months, has an imminent-hazard complaint, or is involved in a fatal crash. An unsatisfactory safety rating or a §386.72 imminent-hazard OOS order can revoke operating authority within 45 days.',
  ARRAY['compliance review','DOT audit','safety audit','new entrant audit','imminent hazard','safety rating','unsatisfactory','PRISM hold'],
  'Carrier meets any of: (a) New Entrant period audit not completed/passed within 12 months of DOT number issuance, (b) 4 consecutive months over BASIC intervention threshold in any of Unsafe Driving / HOS / Crash Indicator, (c) imminent-hazard OOS order issued under 49 USC §521(b)(5), or (d) conditional/unsatisfactory safety rating received under §385.13.',
  '49 CFR §385.321 (New Entrant); 49 CFR §385.13 (safety rating); 49 USC §521(b)(5) (imminent hazard); FAST Act §5305(a) (4-month rule).',
  'Assemble the compliance packet (driver files, DQs, DVIRs, ELD records, drug/alcohol program, maintenance records) within 48 hours. Engage a DOT compliance consultant/attorney. Respond to every request on time, and if unsatisfactory is proposed, file a §385.15 Safety Rating Upgrade request within 60 days (90 for passenger) with a corrective action plan.',
  'safety → operations → ownership',
  ARRAY['CSA-001','CSA-002','AUTH-001','OOS-001','CLEAR-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- =============================================================================
-- Domain 2: Driver Safety & Behavior (27 rules)
-- Extracted from domain-02-driver-safety-behavior.pdf
-- Note: PDF header states 25 but document defines 27 rules (same counting
-- discrepancy as Domain 1). All defined rules are included.
-- =============================================================================

-- SPEED-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'SPEED-001',
  'Interstate speeding over posted limit',
  'driver_safety_behavior',
  'medium',
  'Flags a CMV traveling 6–14 mph over the posted limit on interstates (typ. 65–75 mph posted). CSA scores speeding 6–10 over at weight 4 and 11–14 over at weight 7 under Unsafe Driving BASIC. Sustained interstate speeding is a primary predictor of Unsafe Driving BASIC intervention thresholds.',
  ARRAY['SPEEDING ALERT','Speed Violation','Speeding Detected','over posted limit','exceeded speed limit','I-','Interstate','mph over','posted speed'],
  'Vehicle GPS/ECM speed ≥ posted limit + 6 mph for ≥ 60 seconds on an interstate/limited-access highway, OR Motive/Samsara "Speeding" safety event fires (Motive default: >6 mph over posted for >1 min).',
  '49 CFR 392.2 (compliance with state speed laws); FMCSA CSA SMS Unsafe Driving BASIC table (§392.2-SLLS2/SLLS3); Motive Safety Events docs.',
  'Tori posts a moderate alert: "Speeding event confirmed — notify driver to slow to posted limit, log for weekly coaching review."',
  'Dispatch → Safety Manager (weekly roll-up). Immediate escalation only if repeated within same shift.',
  ARRAY['SPEED-002','SPEED-003','SPEED-004','COACH-001','SCORE-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- SPEED-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'SPEED-002',
  'Severe speeding (15+ mph over limit)',
  'driver_safety_behavior',
  'critical',
  'A 15+ mph over-limit event is a CSA "Speeding 4" violation with severity weight 10 — the maximum under Unsafe Driving BASIC — and is on the same tier as reckless driving and texting. One confirmed incident materially moves the carrier''s percentile.',
  ARRAY['Severe Speeding','15 mph over','SPEEDING ALERT','excessive speed','SLLS4','90 mph','85 mph','flying','hammer down'],
  'GPS/ECM speed ≥ posted limit + 15 mph for any confirmed duration ≥ 10 seconds, OR ECM-recorded top speed ≥ 80 mph on roads posted ≤ 65 mph.',
  '49 CFR 392.2; FMCSA CSA SMS Table A-1, violation code 392.2-SLLS4 (severity weight 10).',
  'Tori issues critical alert: "Severe speeding — pull driver immediately, review dashcam, mandatory same-day coaching, document in driver file."',
  'Dispatch → Safety Manager → Director of Safety within 2 hours; ownership notified if driver is a repeat SPEED-002 offender.',
  ARRAY['SPEED-001','SPEED-005','COACH-001','SCORE-001','AGG-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- SPEED-003
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'SPEED-003',
  'Urban and state-highway overspeed',
  'driver_safety_behavior',
  'medium',
  'Covers speeding on state highways (typ. 55–65 mph posted) and urban streets (25–45 mph). Urban overspeeds carry higher collision severity per NHTSA because of pedestrian/intersection exposure, even when mph over is small.',
  ARRAY['Speeding Detected','urban speeding','city speed','35 in a 25','residential','state route','SR-','US-','posted 45','school route'],
  'Speed ≥ posted + 5 mph on any road posted ≤ 55 mph for ≥ 30 seconds, OR Lytx/Samsara "Speeding" trigger on non-interstate geofence.',
  '49 CFR 392.2; state vehicle codes; CSA SMS §392.2-SLLS tables.',
  'Tori notifies dispatch to radio the driver and log the event for coaching; annotate trip with geofence context.',
  'Dispatch → Safety Manager (daily digest).',
  ARRAY['SPEED-001','SPEED-002','SPEED-004','SPEED-005'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- SPEED-004
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'SPEED-004',
  'Construction and school zone speeding',
  'driver_safety_behavior',
  'high',
  'Work-zone and school-zone speeding carry state-law fine multipliers (typically 2x–3x) and a discrete CSA code (§392.2-SLLSWZ). Struck-by incidents in work zones kill ~130 workers per year per FHWA; CMVs are overrepresented.',
  ARRAY['work zone','construction zone','school zone','reduced speed','workers present','cones','SLLSWZ','flagger','25 school'],
  'Speed > posted reduced limit in an active work zone or school zone by ≥ 1 mph for any duration, OR telematics geofence flags any movement > 5 mph over the temporary limit.',
  '49 CFR 392.2; FMCSA CSA SMS §392.2-SLLSWZ/SLLSSZ; state work-zone enhancement statutes (e.g., NY VTL 1180-c, CA CVC 42010).',
  'Tori flags high-severity event: "Work/school-zone overspeed — immediate radio warning, mandatory coaching session within 24 hrs, check for active citation."',
  'Dispatch → Safety Manager same day → ownership if event involved workers or students present.',
  ARRAY['SPEED-001','SPEED-002','SPEED-003','COACH-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- SPEED-005
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'SPEED-005',
  'Weigh-station and ramp overspeed',
  'driver_safety_behavior',
  'high',
  'Weigh-station ramps and exit ramps are posted 5–15 mph and are a leading rollover site for loaded combination vehicles. FMCSA rollover research finds ramp/curve overspeed is the most common rollover cause for heavy trucks.',
  ARRAY['weigh station','scale house','ramp','exit','advisory speed','rollover','tip','yaw','RSC activated'],
  'Speed > posted ramp/advisory speed by ≥ 5 mph at geofenced weigh stations or mapped ramps, OR ESC/RSC (Rollover Stability Control) event fired, OR lateral G ≥ 0.35 g on curve.',
  '49 CFR 392.2; FMCSA "Rollover Prevention for Truck Drivers" (FMCSA-ADO-09-009); state weigh-station signage.',
  'Tori pushes urgent alert: "Ramp overspeed or stability event — confirm driver is safe, verify load shift, require dashcam review."',
  'Dispatch (immediate radio) → Safety Manager within 1 hr → Director of Safety if RSC or yaw event fired.',
  ARRAY['SPEED-004','ROLL-001','CORNER-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- BRAKE-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'BRAKE-001',
  'Harsh braking event (vendor threshold)',
  'driver_safety_behavior',
  'medium',
  'Harsh braking is a leading collision indicator. Samsara triggers at the configured g-force (default sensitivity "Normal" for Heavy Duty), Motive triggers between 0.34 g and 0.56 g (7.46–12.28 mph/s) depending on vehicle class, and Lytx uses a configurable g-threshold plus MV+AI context.',
  ARRAY['HARSH BRAKING ALERT','Harsh Brake','Hard Brake','Safety Event: Harsh Braking','g-force','deceleration','brake slam','panic brake'],
  'Deceleration ≥ 0.30 g (company threshold, matching Motive Heavy-Duty low-end and Samsara "Normal" sensitivity), detected above 5 mph; 1 event per driver per trip logged but not coached unless severity ≥ 0.45 g (DOT "harsh" reference value).',
  'Company Policy (G-force threshold from Samsara/Motive/Lytx default settings — Motive Help Center "Harsh Driving"; Samsara KB "Harsh Event Detection"; GPS Insight/DOT harsh-brake reference 0.45 g).',
  'Tori logs event, notes max g and video clip link; coaching only if threshold ≥ 0.45 g or if BRAKE-001 events ≥ 3 in 7 days.',
  'Logged to Safety Manager daily digest; escalated if part of AGG-001 pattern.',
  ARRAY['ACCEL-001','CORNER-001','AGG-001','FOLLOW-001','COACH-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- ACCEL-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'ACCEL-001',
  'Harsh acceleration event',
  'driver_safety_behavior',
  'low',
  'Rapid throttle application wastes fuel (0.5+ gallon per aggressive start per Samsara data), wears drivetrain, and correlates with aggressive driving. Motive defines the threshold band 0.34–0.56 g by vehicle class; 0.30 g is the common fleet default.',
  ARRAY['HARSH ACCELERATION','Hard Accel','Safety Event: Harsh Acceleration','rapid acceleration','jackrabbit','g-force accel','throttle spike'],
  'Longitudinal forward acceleration ≥ 0.30 g at vehicle speed > 5 mph (below 5 mph events are filtered out by Samsara/Motive per vendor docs).',
  'Company Policy (G-force threshold from Samsara/Motive/Lytx default settings — Motive "Harsh Driving" help article; Samsara KB "Harsh Event Detection").',
  'Tori logs event to driver scorecard; no immediate action unless combined with BRAKE-001 or CORNER-001 within 10 min (see AGG-001).',
  'Safety Manager weekly coaching review.',
  ARRAY['BRAKE-001','CORNER-001','AGG-001','SCORE-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- CORNER-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'CORNER-001',
  'Harsh cornering / lateral G event',
  'driver_safety_behavior',
  'medium',
  'Harsh cornering correlates with rollover risk for high-CG equipment (reefers, tankers, step-decks). Motive "Hard Cornering" fires between 0.34 g and 0.56 g lateral; Samsara uses configurable sensitivity per vehicle class with the VG accelerometer.',
  ARRAY['HARSH TURN','Hard Cornering','Safety Event: Harsh Turn','lateral g','sharp turn','roll risk','swerve'],
  'Lateral acceleration ≥ 0.30 g at speed > 5 mph, OR ≥ 0.35 g at any speed for loaded combination vehicles (elevated rollover regime).',
  'Company Policy (G-force threshold from Samsara/Motive/Lytx default settings — Motive Safety Events docs stating 0.34 g–0.56 g trigger band; Samsara harsh turn docs).',
  'Tori flags event, links dashcam clip, asks dispatch to verify load securement and driver condition.',
  'Safety Manager → Director of Safety if lateral G ≥ 0.45 g or paired with RSC/yaw event (see ROLL-001).',
  ARRAY['BRAKE-001','ACCEL-001','SPEED-005','ROLL-001','AGG-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- PHONE-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'PHONE-001',
  'Hand-held phone use while driving',
  'driver_safety_behavior',
  'critical',
  '49 CFR 392.82 prohibits a CMV driver from holding a mobile phone, dialing with more than one button, or reaching in a way that breaks seated-belted position. CSA severity weight is 10. Second offense in 3 years = 60-day disqualification; third = 120 days. Driver fine up to $2,750; carrier up to $11,000.',
  ARRAY['Mobile Usage','Handheld Device','Cell Phone Use','phone detected','Driver Distraction Detected','hand-held','texting','holding phone','Distraction Event'],
  'Samsara "Mobile Usage" or Motive "Cell Phone Use" AI dashcam event fires while the unit is on an active trip (speed > 5 mph), OR Lytx "Handheld Device" behavior is human-reviewed and confirmed.',
  '49 CFR 392.82; 49 CFR 390.5T (definition of "using"); FMCSA CSA SMS severity weight 10.',
  'Tori posts critical alert: "Confirmed hand-held phone use — immediate driver call, preserve dashcam clip, schedule same-day coaching, document in DQ file."',
  'Dispatch → Safety Manager (immediate) → Director of Safety within 4 hours.',
  ARRAY['PHONE-002','DASH-001','COACH-001','SCORE-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- PHONE-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'PHONE-002',
  'Texting and on-device typing',
  'driver_safety_behavior',
  'critical',
  '49 CFR 392.80 forbids any manual entry of alphanumeric text on an electronic device while driving a CMV — SMS, email, IM, web browsing. CSA severity weight 10 (Unsafe Driving BASIC, 392.80(a)). Same disqualification schedule as §392.82.',
  ARRAY['Texting','SMS','typing','Driver Distraction Detected','eyes off road','Inattentive','looking down','Distracted Driving'],
  'Samsara/Motive AI dashcam confirms driver head-down + hand-on-device while vehicle speed > 5 mph, OR Lytx "Handheld Device" + "Inattentive" tags co-occur within same event.',
  '49 CFR 392.80; FMCSA CSA SMS §390.17DT (severity weight 10).',
  'Tori issues critical alert, preserves video, opens coaching case, and flags DQ review if second confirmed event in 12 months.',
  'Dispatch → Safety Manager immediately → Director of Safety same day → ownership on repeat offense.',
  ARRAY['PHONE-001','DASH-001','FATIGUE-001','COACH-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- PHONE-003
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'PHONE-003',
  'Other in-cab distractions (eating, grooming, smoking)',
  'driver_safety_behavior',
  'medium',
  'Secondary distractions detected by AI dashcams — eating, drinking, grooming, smoking — are coachable "Inattentive Driving" events under CSA §392.2-INAT (severity weight 5) when they cause lane deviation or other cues.',
  ARRAY['Food/Drink','Eating Detected','Smoking','grooming','Inattentive','Distraction Event','eyes off road','head down'],
  'Lytx "Food/Drink" or "Smoking" trigger, OR Samsara "Inattentive Driving" AI event while trip is active, confirmed by human review or ≥ 5-second head-off-road signal.',
  '49 CFR 392.2 (inattentive driving); CSA SMS §392.2-INAT (severity weight 5); Lytx DriveCam MV+AI behavior catalog.',
  'Tori tags event for weekly coaching; escalate only if paired with lane-departure or FOLLOW-001 event.',
  'Safety Manager weekly review.',
  ARRAY['PHONE-001','PHONE-002','LANE-001','DASH-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- SEAT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'SEAT-001',
  'Seatbelt non-use',
  'driver_safety_behavior',
  'high',
  '49 CFR 392.16 requires the driver to wear the installed seatbelt at all times when operating a CMV. CSA severity weight is 7 under Unsafe Driving BASIC. Samsara and Motive detect unbelted driving via seatbelt sensor + AI confirmation; Lytx flags "No Seatbelt" via MV+AI.',
  ARRAY['Not Wearing Seatbelt','No Seatbelt','Seatbelt Violation','unbelted','seatbelt off','Safety Event: Seatbelt'],
  'AI dashcam or seatbelt switch indicates driver unbelted with speed > 5 mph for ≥ 30 seconds on an active trip.',
  '49 CFR 392.16; FMCSA CSA SMS §392.16 (severity weight 7).',
  'Tori alerts dispatch to radio driver immediately to belt up and logs event for coaching.',
  'Dispatch → Safety Manager same day; second event in 30 days escalates to Director of Safety.',
  ARRAY['ACCIDENT-001','COACH-001','SCORE-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- FOLLOW-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FOLLOW-001',
  'Following too close / tailgating',
  'driver_safety_behavior',
  'high',
  'FMCSA CMV Driver Handbook rule: 1 second per 10 ft of vehicle length under 40 mph, add 1 sec above 40 mph (≈ 7 seconds for a 70-ft tractor-trailer at highway speed). Under CSA §392.2-FC it carries severity weight 5. Samsara "Tailgating" and Motive "Close Following" AI events fire when following distance drops below 0.6–1.0 sec depending on configuration.',
  ARRAY['Tailgating','Close Following','Following Distance','Unsafe Following','critical distance','0.6 sec','following too close','FCW'],
  'AI dashcam measured following distance < 1.0 second for ≥ 10 seconds at speed > 45 mph, OR < 0.6 sec for any duration at any highway speed.',
  '49 CFR 392.2; FMCSA CMV Driver Handbook §2.7 (7-second rule); CSA §392.2-FC severity weight 5; Samsara/Lytx following-distance docs.',
  'Tori flags high-severity event: "Tailgating — coach driver same day; review dashcam; confirm no brake-check pattern."',
  'Dispatch → Safety Manager same day; paired FCW events escalate to Director of Safety.',
  ARRAY['BRAKE-001','DASH-001','DASH-002','AGG-001','COACH-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- FATIGUE-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FATIGUE-001',
  'Fatigue indicators from dashcam (drowsy / microsleep)',
  'driver_safety_behavior',
  'critical',
  'Fatigue-related crashes disproportionately happen in the circadian low windows (02:00–06:00 and 14:00–16:00). Motive "Drowsiness" fires when driver yawns and shows distraction within a 2-minute window above 5 mph; Samsara flags "Drowsy" via eye-closure and head-pose; Lytx "Inattentive" covers fatigue patterns including lane drift and slow reaction.',
  ARRAY['Drowsiness','Drowsy Driving','Fatigue Detected','eye closure','yawning','microsleep','lane drift','nodding off','falling asleep'],
  'AI dashcam "Drowsy/Fatigue" event, OR ≥ 2 unintended lane-departure events plus yaw-rate spike within 10 minutes, OR driver self-report/dispatcher observation of fatigue keywords in Telegram.',
  '49 CFR 392.3 (Ill or fatigued operator — prohibits driving while ability impaired); 49 CFR 395 HOS; Motive Safety Events "Drowsiness"; Samsara Drowsy docs.',
  'Tori posts critical alert: "Pull off at next safe location, take 30-min break. Verify HOS clock, confirm sleeper availability."',
  'Dispatch (immediate radio) → Safety Manager within 30 min → ownership if driver continues driving past fatigue flag.',
  ARRAY['FATIGUE-002','LANE-001','ROAD-001','DASH-001','ACCIDENT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- FATIGUE-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FATIGUE-002',
  'HOS driving time without a break',
  'driver_safety_behavior',
  'high',
  '49 CFR 395.3(a)(3)(ii) requires a 30-minute break after 8 cumulative hours of driving time. The 11-hour driving limit and 14-hour on-duty window bound a shift. Continued driving past these limits is a CSA HOS Compliance BASIC violation and a fatigue risk.',
  ARRAY['8 hours driving','no break','approaching 11-hr','14-hour clock','HOS alert','ELD warning','hours of service','break required','30-min break'],
  'ELD shows > 8 cumulative driving hours since last qualifying 30-min break, OR driver is within 30 min of 11-hr or 14-hr limit without a planned stop logged.',
  '49 CFR 395.3(a)(2)–(a)(3); FMCSA ELD mandate.',
  'Tori prompts dispatch: "Driver must take 30-min break within 30 min — identify safe stop, update plan, confirm with driver."',
  'Dispatch → Safety Manager if driver exceeds limit.',
  ARRAY['FATIGUE-001','ROAD-001','COACH-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- IDLE-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'IDLE-001',
  'Excessive idling vs company policy',
  'driver_safety_behavior',
  'low',
  'Company policy and most state ATCM idle laws converge on a 5-minute cap for diesel CMVs > 10,000 lbs (CA 13 CCR 2485, NY 6 NYCRR 217-3, MA 310 CMR 7.11, PA Act 124, TX 30 TAC 114.512). NJ is stricter at 3 min (NJAC 7:27-14/15). Samsara/Motive "Engine Idle" alerts fire at the configured threshold (commonly 5–10 min).',
  ARRAY['Engine Idle Alert','Excessive Idling','Idle Alert','idling','engine running','parked running','idle time exceeded'],
  'Continuous idle > 5 minutes in CA/NY/MA/PA/TX regulated areas (or > 3 minutes in NJ/CT), OR > 10 minutes anywhere else under company policy, with vehicle stationary and not in sleeper-berth exemption.',
  '13 CCR 2485 (CA); 6 NYCRR 217-3 (NY); NJAC 7:27-14/15 (NJ); 310 CMR 7.11 (MA); 35 PA Act 124; 30 TAC 114.512 (TX, certain counties); EPA SmartWay guidance; Company Policy.',
  'Tori notifies driver via dispatch to shut down engine unless legal sleeper/APU exemption applies; log fuel waste cost estimate.',
  'Dispatch → Operations weekly fuel review.',
  ARRAY['IDLE-002','COACH-001','SCORE-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- IDLE-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'IDLE-002',
  'Extended idle (possible fuel theft / sleeping with engine on)',
  'driver_safety_behavior',
  'medium',
  'Extended idle of 6+ hours indicates either (a) a legal sleeper-berth rest with main engine running (non-compliant in idle-restricted states without APU), or (b) potential fuel theft / pump-and-drive abuse. Either scenario is a loss-prevention and compliance concern.',
  ARRAY['extended idle','long idle','6 hours idle','overnight idle','fuel theft','unusual idle pattern','APU off','Engine Idle Alert duration'],
  'Continuous idle ≥ 6 hours with no movement, OR fuel-level drop > 20 gallons during an idle event with no fuel-card transaction logged.',
  'Company Policy; state ATCM sleeper exemptions (e.g., 13 CCR 2485(d)); EPA SmartWay APU recommendations.',
  'Tori alerts operations: "Verify driver location and load status; confirm APU status; reconcile with fuel-card transactions for possible theft."',
  'Operations → Safety Manager → ownership if fuel reconciliation gap confirmed.',
  ARRAY['IDLE-001','ACCIDENT-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- AGG-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'AGG-001',
  'Aggressive driving cluster',
  'driver_safety_behavior',
  'high',
  'NHTSA defines aggressive driving as a combination of moving violations that endangers others. In fleet practice, 3+ harsh events (brake/accel/corner/speed) in a rolling 10-minute window is the industry coaching trigger used by Samsara, Motive, and Netradyne scorecards.',
  ARRAY['multiple harsh events','aggressive driving','stacking events','3 events in 10 min','safety cluster','risk spike'],
  '≥ 3 of {BRAKE-001, ACCEL-001, CORNER-001, SPEED-001} within any rolling 10-minute window on a single trip.',
  'NHTSA definition of aggressive driving; FMCSA CSA Unsafe Driving BASIC; industry standard (Samsara Safety Score methodology, Motive Safety Score).',
  'Tori posts high-priority alert: "Aggressive pattern — dispatch radio check, mandatory same-day coaching, review dashcam for contributing distraction."',
  'Dispatch immediately → Safety Manager within 2 hrs.',
  ARRAY['BRAKE-001','ACCEL-001','CORNER-001','SPEED-001','COACH-001','SCORE-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- ACCIDENT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'ACCIDENT-001',
  'Post-accident protocol activation',
  'driver_safety_behavior',
  'critical',
  'Any crash triggers 49 CFR 390.15 accident-register duties and possibly 49 CFR 382.303 post-accident drug/alcohol testing. Alcohol test must be attempted within 2 hrs (no later than 8 hrs); drug test within 32 hrs. Samsara flags any event > 2.0 g as a crash. Reporting window to carrier dispatch is typically 15 minutes per company policy.',
  ARRAY['CRASH DETECTED','Collision','Accident','hit','rolled','crash event','airbag','police on scene','911','tow truck'],
  'Samsara crash event (> 2.0 g), OR Motive/Lytx collision event, OR any driver/dispatcher Telegram message containing collision keywords.',
  '49 CFR 390.15 (accident register); 49 CFR 382.303 (post-accident testing); 49 CFR 392.40–392.41 (duties after accident).',
  'Tori launches critical workflow: "1) Confirm driver safety and injuries, 2) call 911 if injury/fatality/disabling damage, 3) preserve scene + photos, 4) determine if §382.303 triggers (fatality / citation+injury / citation+tow), 5) dispatch post-accident testing within 2 hrs alcohol / 32 hrs drug, 6) notify insurer."',
  'Dispatch (immediate) → Safety Manager (immediate) → Director of Safety → ownership within 1 hr.',
  ARRAY['ACCIDENT-002','ROAD-001','SEAT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- ACCIDENT-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'ACCIDENT-002',
  'Roadside stop / breakdown safety procedure',
  'driver_safety_behavior',
  'high',
  '49 CFR 392.22 requires the driver to activate hazard warning flashers immediately and, within 10 minutes, place 3 warning triangles at 10 ft, 100 ft, and 100 ft to the rear (or modified placement on divided highways and hills/curves). OSHA recommends a high-visibility Class 2 vest for any roadway egress.',
  ARRAY['breakdown','shoulder stop','pulled over','flat tire','blown tire','disabled','hazards on','triangles','warning devices','roadside'],
  'Vehicle stopped on highway shoulder > 10 minutes with no triangles deployed, OR driver egresses on traffic side without hi-vis vest, OR hazards not activated within 1 minute of stop.',
  '49 CFR 392.22; 49 CFR 393.95 (emergency equipment); 23 CFR 634 (hi-vis for roadway workers); OSHA 1926.201.',
  'Tori prompts dispatch: "Confirm triangles deployed within 10 min, hi-vis vest on, emergency roadside assistance ETA, and driver positioned off traffic side."',
  'Dispatch → Safety Manager if driver out > 60 min or on interstate shoulder.',
  ARRAY['ACCIDENT-001','ROAD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- ROAD-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'ROAD-001',
  'Severe weather / hazardous condition driving',
  'driver_safety_behavior',
  'high',
  '49 CFR 392.14 requires "extreme caution" when hazardous conditions (snow, ice, sleet, fog, mist, rain, dust, smoke) adversely affect visibility or traction, and mandates reducing speed or discontinuing driving when conditions become sufficiently dangerous. CSA severity weight for §392.14 is 5.',
  ARRAY['ice','black ice','snow','fog','visibility','whiteout','storm','winter storm warning','high winds','tornado','hazardous conditions','chains required'],
  'Vehicle moving at > 35 mph when visibility < 500 ft, OR speed not reduced ≥ 10 mph below posted in active NWS winter storm warning or fog advisory, OR high-profile unit continuing through wind advisory > 40 mph.',
  '49 CFR 392.14; CSA SMS Unsafe Driving BASIC §392.14 (severity weight 5); NWS advisory definitions.',
  'Tori alerts dispatch + driver: "Reduce speed or stage at safe location until advisory lifts; document weather-related delay in trip notes."',
  'Dispatch → Safety Manager; owner-imposed shutdown decision if region-wide NWS warning active.',
  ARRAY['SPEED-005','ROLL-001','FATIGUE-001','ACCIDENT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- DASH-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DASH-001',
  'Dashcam distraction / inattentive event',
  'driver_safety_behavior',
  'high',
  'Consolidated Samsara/Motive/Lytx AI dashcam event class for "Inattentive Driving," "Distraction," or eyes-off-road. Lytx MV+AI catalog covers 100+ behaviors including inattentive, rolling stop, near-collision, forward collision, and lane departure. CSA §392.2-INAT severity weight 5.',
  ARRAY['Driver Distraction Detected','Inattentive','Distraction Event','eyes off road','head down','Not looking at road','AI Event','Safety Inbox','Risk Event Triggered'],
  'Any Samsara "Inattentive Driving," Motive "Distraction," or Lytx "Inattentive" event confirmed by human review while speed > 10 mph.',
  '49 CFR 392.2; CSA SMS §392.2-INAT (severity weight 5); Samsara/Motive/Lytx AI dashcam docs.',
  'Tori tags for coaching; escalate if paired with FOLLOW-001, LANE-001, or FATIGUE-001 within same trip.',
  'Safety Manager daily review.',
  ARRAY['PHONE-001','PHONE-002','PHONE-003','FATIGUE-001','DASH-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- DASH-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DASH-002',
  'Rolling stop / forward-collision / near-collision event',
  'driver_safety_behavior',
  'high',
  'Captures the "critical road event" class: rolling stops at stop signs (Motive: speed fails to drop below 6 mph within 7 seconds after the stop sign leaves the dashcam frame), Forward Collision Warnings, and Near-Collisions. These are leading indicators of imminent crash.',
  ARRAY['Rolling Stop','Stop Sign Violation','Forward Collision Warning','FCW','Near Collision','Late Response','imminent collision','Risk Event Triggered'],
  'Motive/Lytx "Rolling Stop" confirmed, OR Samsara/Motive FCW fires, OR Lytx "Near Collision" human-reviewed.',
  '49 CFR 392.2 (obey traffic-control devices, §392.2C severity weight 5); state vehicle codes; Motive Safety Events docs; Lytx DriveCam event catalog.',
  'Tori alerts Safety Manager: "Review dashcam, coach same day, check for contributing distraction or fatigue."',
  'Safety Manager same day → Director of Safety if near-collision.',
  ARRAY['DASH-001','FOLLOW-001','PHONE-001','COACH-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- LANE-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'LANE-001',
  'Lane departure / unsafe lane change',
  'driver_safety_behavior',
  'medium',
  'Unintended lane departure is both a fatigue indicator and a CSA violation under §392.2-ML "Failure to Maintain Lane" (severity weight 5) or §392.2-LC "Improper Lane Change" (weight 5). Samsara, Motive, and Lytx each ship a Lane Departure / Lane Drift AI trigger.',
  ARRAY['Lane Departure','Lane Drift','crossed line','no signal','improper lane change','drifted','LDW','Lane Departure Warning'],
  'AI dashcam confirms ≥ 2 lane departures in 30 minutes without turn signal, OR a single lane departure > 3 seconds across a solid line at speed > 45 mph.',
  '49 CFR 392.2; CSA SMS §392.2-ML and §392.2-LC (severity weight 5 each); vendor LDW docs.',
  'Tori flags for coaching; if paired with FATIGUE-001 or DASH-001, promote to critical and ask dispatch to check on driver.',
  'Safety Manager daily review.',
  ARRAY['FATIGUE-001','DASH-001','DASH-002','COACH-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- ROLL-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'ROLL-001',
  'Rollover stability / yaw event',
  'driver_safety_behavior',
  'critical',
  'Rollover Stability Control (RSC) or Electronic Stability Control (ESC) activations indicate the unit was at or near rollover threshold. FMCSA rollover research shows most heavy-truck rollovers occur on ramps/curves with speed > advisory and lateral G > 0.35–0.40 g. A single activation requires immediate intervention.',
  ARRAY['RSC','Rollover Stability','ESC','Stability Control','yaw event','near rollover','tip-over','lateral g','0.4 g'],
  'ECM-reported RSC/ESC activation, OR measured lateral G ≥ 0.40 g in any curve, OR Samsara "Rolled Over" / "Near Rollover" crash classification.',
  'FMCSA "Rollover Prevention for Truck Drivers" (FMCSA-ADO-09-009); FMCSA FMVSS 136 (ESC on heavy trucks); telematics ECM event codes.',
  'Tori issues critical alert: "Confirm driver safety, inspect for load shift, pull truck from service for mechanical check, mandatory coaching."',
  'Dispatch immediately → Safety Manager → Director of Safety → ownership within 1 hr.',
  ARRAY['SPEED-005','CORNER-001','ROAD-001','ACCIDENT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- COACH-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'COACH-001',
  'Repeat-offender coaching trigger',
  'driver_safety_behavior',
  'high',
  'Industry best practice (Samsara, Motive, Lytx coaching playbooks; Smith System) treats a driver as a repeat offender when they accrue 3+ coachable safety events in a rolling 30 days or 5+ in 90 days. Early intervention reduces crash risk by up to 34% per Samsara''s 18-month study.',
  ARRAY['repeat offender','3 strikes','coaching required','multiple events','red whistle','coachable','90-day','30-day trend'],
  'Any single driver accumulates ≥ 3 coachable events (any combination of SPEED, BRAKE, ACCEL, CORNER, PHONE, SEAT, FOLLOW, LANE, DASH) in 30 rolling days, OR ≥ 5 in 90 days, OR ≥ 1 critical event (PHONE-001/002, SPEED-002, ACCIDENT-001, FATIGUE-001, ROLL-001) at any time.',
  'Company Policy (aligned with Samsara Safety Score methodology, Motive Safety Score 4-week rolling window, Lytx DriveCam coaching playbook).',
  'Tori opens a formal coaching case, schedules 1:1 within 7 days, and documents plan + dashcam clips.',
  'Safety Manager → Director of Safety after 2 failed coaching cycles → ownership for potential termination review.',
  ARRAY['SCORE-001','AGG-001','PHONE-001','PHONE-002','SPEED-002','FATIGUE-001','ROLL-001','ACCIDENT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- SCORE-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'SCORE-001',
  'Driver safety scorecard ranking',
  'driver_safety_behavior',
  'medium',
  'Motive''s Safety Score ranges 50–100 over a 4-week rolling window, weighted per behavior and normalized per 1,000 miles. Samsara Safety Score is 0–100. Fleet-wide ranking drives coaching priority, driver incentive pay, and is correlated with CSA Unsafe Driving BASIC percentile. FMCSA intervention threshold for general carriers is the 65th percentile.',
  ARRAY['Safety Score','scorecard','driver ranking','bottom 10%','below threshold','CSA percentile','Unsafe Driving BASIC','score dropped'],
  'Driver Safety Score falls into fleet''s bottom decile for 2 consecutive weeks, OR drops > 15 points week-over-week, OR carrier Unsafe Driving BASIC percentile ≥ 65 (general) or ≥ 50 (HM/passenger).',
  'FMCSA SMS Methodology v4.0 (Unsafe Driving BASIC); Motive Safety Score documentation; Samsara Safety Score documentation.',
  'Tori flags driver for enhanced coaching cadence and, at carrier level, surfaces the BASIC trend to ownership for corrective plan.',
  'Safety Manager weekly → Director of Safety monthly → ownership on BASIC breach.',
  ARRAY['COACH-001','AGG-001','SPEED-001','SPEED-002','PHONE-001','PHONE-002','FATIGUE-001','ROLL-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- =============================================================================
-- Domain 3: Equipment & Vehicle Maintenance (25 rules)
-- Extracted from domain-03-equipment-vehicle-maintenance.pdf
-- =============================================================================

-- PRETRIP-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'PRETRIP-001',
  'Missing or failed pre-trip inspection',
  'equipment_vehicle_maintenance',
  'high',
  'Every driver must be satisfied, before operating a CMV, that eleven safety components are in good working order. Messages indicating the driver skipped the pre-trip, or drove despite known defects, expose the carrier to 396.3/392.7 violations and multi-thousand-dollar CSA severity weights.',
  ARRAY['no pre-trip','skipped pretrip','didn''t do pretrip','rolling without checking','just go','pretrip not completed','inspection not done','DVIR Submitted with Defects – Unsafe'],
  'Driver departs origin without documented completion of 11-point inspection (service brakes, parking brake, steering, lighting, tires, horn, wipers, mirrors, coupling, wheels/rims, emergency equipment), OR message text confirms a pre-trip was skipped.',
  '49 CFR 392.7(a) (eCFR current); 49 CFR 396.13(a)',
  'Hold the unit; require driver to complete and log the 11-point pre-trip before dispatch; verify no open defects from last DVIR.',
  'Dispatch → Safety Manager (if repeat within 30 days, Director of Safety)',
  ARRAY['DVIR-001','BRKADJ-001','TIRE-001','LIGHT-001','COUPLE-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- PRETRIP-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'PRETRIP-002',
  'Departure with known open defect',
  'equipment_vehicle_maintenance',
  'critical',
  'Driving a CMV with a known safety defect violates 392.7 regardless of pre-trip completion. Telegram chatter acknowledging a defect while en route ("brake dragging but I''ll make it") is a stop-work trigger.',
  ARRAY['still driving','it''ll hold','limp it in','keep going','ignore the light','I''ll baby it','runs rough but','defect but driving'],
  'Any message acknowledging a safety-critical defect (brakes, steering, lighting required, tires, coupling) while the unit is in motion or scheduled to depart.',
  '49 CFR 392.7(a); 49 CFR 396.7(a) (prohibited operation of defective equipment)',
  'Immediate stop; dispatch mobile mechanic or tow per REPAIR-001 decision tree; do not authorize continued travel.',
  'Dispatch → Safety Manager → Director of Maintenance',
  ARRAY['DVIR-001','BRAKE-003','PRETRIP-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- DVIR-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DVIR-001',
  'DVIR not submitted when defects present',
  'equipment_vehicle_maintenance',
  'high',
  'Property-carrying CMVs require a written DVIR at the end of the day when any defect or deficiency is found or reported. Missing DVIRs tied to reported defects trigger 396.11 violations ($1,270/day) and audit exposure.',
  ARRAY['found a defect','something wrong with','needs repair','write it up','DVIR not submitted','no report filed','Motive Alert: DVIR Submitted with Defects – Unsafe','truck has issue but no paperwork'],
  'A defect/deficiency is reported in messaging, but no DVIR record is filed within the same work day or before next dispatch; OR a submitted DVIR marked "Unsafe" lacks a corresponding repair certification.',
  '49 CFR 396.11(a)(1)-(3); 3-month retention per 396.11(a)(4)',
  'Generate/complete DVIR immediately; route unit to maintenance; mechanic must sign repair certification before next dispatch.',
  'Dispatch → Maintenance Supervisor → Safety Manager',
  ARRAY['PRETRIP-001','PRETRIP-002','PM-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- DVIR-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DVIR-002',
  'Next driver operated without reviewing prior DVIR',
  'equipment_vehicle_maintenance',
  'medium',
  'When a prior-day DVIR lists defects, the next driver must review and sign it before operation per 396.13(b). Failure breaks the repair-certification chain and creates audit risk.',
  ARRAY['didn''t see the DVIR','wasn''t told about repair','unit still has defect','previous driver never mentioned','no repair cert attached'],
  'Driver operates a unit with a prior DVIR showing defects but without a signed acknowledgment or mechanic repair certification visible in the eDVIR platform (Motive/Samsara Inspection, KellerEncompass).',
  '49 CFR 396.13(b); 49 CFR 396.11(a)(3)',
  'Hold unit; confirm repair completion; obtain driver acknowledgment signature; reset dispatch clock.',
  'Dispatch → Maintenance Supervisor',
  ARRAY['DVIR-001','PM-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- PM-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'PM-001',
  'Preventive maintenance interval overrun',
  'equipment_vehicle_maintenance',
  'medium',
  'Carriers must follow a systematic PM schedule per 396.3. Industry standard is A-service 15k–25k mi, B-service ~50k mi, C-service ~100k mi (or annually, combined with 396.17). Overruns of more than 10% are a red flag for audit and a leading indicator of roadside failure.',
  ARRAY['PM overdue','past service interval','needs A service','needs B service','needs C service','hasn''t been serviced','15000 miles over','haven''t done oil change'],
  'Odometer shows PM-A overdue by > 2,500 mi, PM-B overdue by > 5,000 mi, or PM-C / annual overdue by > 30 days past scheduled date.',
  '49 CFR 396.3(a)(1) — systematic inspection/repair/maintenance; TMC RP 401 (PM interval guidance); 49 CFR 396.17 (annual)',
  'Schedule the overdue service at the next terminal; pull unit from dispatch rotation if > 5,000 mi past A or > 60 days past C.',
  'Maintenance Supervisor → Director of Maintenance',
  ARRAY['DVIR-001','BRAKE-002','TIRE-004'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- TIRE-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'TIRE-001',
  'Steer tire tread below 4/32 inch',
  'equipment_vehicle_maintenance',
  'critical',
  'Steer axle tires must have a minimum 4/32-in major-groove tread depth; less is an automatic OOS under CVSA Criteria and 8 CSA severity points. A message about shallow steer tread means the unit is one inspection away from a roadside shutdown.',
  ARRAY['steer tire tread','steer wearing','front tire low tread','4/32','fronts balding','need new steers','wear bars showing on steer'],
  'Measured or reported tread depth on any steer-axle tire major groove < 4/32 in (3.2 mm).',
  '49 CFR 393.75(b); CVSA OOS Criteria Part II Item 10 (2024 ed.)',
  'Pull unit; replace steer tire(s) before dispatch; do not rotate worn drive tires to steer position.',
  'Driver → Dispatch → Maintenance Supervisor',
  ARRAY['TIRE-002','TIRE-003','TIRE-004'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- TIRE-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'TIRE-002',
  'Drive / trailer tire tread below 2/32 inch or flat / fabric exposed',
  'equipment_vehicle_maintenance',
  'critical',
  'Non-steer tires must have at least 2/32-in tread; flat tires or exposed body-ply/belt are immediate OOS. Samsara/Motive TPMS alerts often surface the precursor low-pressure condition.',
  ARRAY['tire flat','fabric showing','cord exposed','belt showing','tread gone','2/32','Critical Under Pressure','Tire Fault','Extreme Under Pressure','blowout'],
  'Tread depth < 2/32 in on any non-steer tire; OR any tire flat (≤ 50% inflation or audible leak); OR body ply / belt material visible through tread or sidewall.',
  '49 CFR 393.75(a), (c); CVSA OOS Criteria Part II Item 10(b)',
  'Dispatch mobile tire service; do not move unit under load until replaced; if spare is legal, driver may proceed at posted speed after mount.',
  'Driver → Dispatch → Maintenance Supervisor',
  ARRAY['TIRE-001','TIRE-003','WHEEL-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- TIRE-003
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'TIRE-003',
  'Tire pressure out of spec (steer 100–105 psi, drive/trailer 90–100 psi)',
  'equipment_vehicle_maintenance',
  'high',
  'Underinflated tires exceed load rating (OOS), increase blowout risk, and raise fuel cost. TPMS alerts from Samsara/Motive should trigger action within the same shift.',
  ARRAY['Tire Pressure Alert','Tire Fault','Under Pressure','low PSI','check tire pressure','85 psi','flat spot','PressurePro','Doran'],
  'Steer tire < 95 psi or > 115 psi; drive/trailer tire < 85 psi or > 110 psi sustained for > 10 minutes; OR sensor reports "Cautionary" / "Critical" per Samsara TPMS categories.',
  '49 CFR 393.75(h) (tire load rating); OEM tire placard; CVSA underinflation OOS when load exceeds sidewall marking',
  'Driver inflates at nearest truck stop; if leak persists, dispatch mobile tire service; log in DVIR.',
  'Driver → Dispatch → Maintenance',
  ARRAY['TIRE-002','PRETRIP-001','WHEEL-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- TIRE-004
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'TIRE-004',
  'Tire age exceeds 10 years or retread on steer (truck regrooved ≥ 4,920 lb)',
  'equipment_vehicle_maintenance',
  'high',
  'Industry consensus (Michelin, Bridgestone, USTMA) caps casing life at 10 years from DOT date code (WWYY). Retreads/regrooved tires on steer axles carrying ≥ 4,920 lb are prohibited by 393.75(e).',
  ARRAY['tire age','DOT date code','old casing','2014','2015 tire','retread on front','regrooved steer'],
  'Any tire in service with DOT WWYY date code > 10 years old; OR regrooved tire with load rating ≥ 4,920 lb mounted on steer axle.',
  '49 CFR 393.75(e); Michelin / Bridgestone technical bulletins on tire service life; USTMA Position Statement',
  'Replace tire at next service; annotate in maintenance record; remove from eligibility for steer use.',
  'Maintenance Supervisor',
  ARRAY['TIRE-001','TIRE-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- BRKADJ-001 (PDF source name: BRAKE-001; renamed to avoid collision with Domain 2 BRAKE-001 harsh-braking event)
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'BRKADJ-001',
  'Brake out of adjustment (pushrod travel > readjustment limit)',
  'equipment_vehicle_maintenance',
  'high',
  'Brakes 1/4 in or more beyond readjustment limit count as one defective brake; 20% defective = vehicle OOS. Any steer brake defect = automatic OOS. This is the most-cited OOS category at roadside.',
  ARRAY['brake out of adjustment','pushrod stroke','long stroke','brake stroke 2 inch','slack adjuster','brake dragging','brakes chattering','20 percent rule'],
  'Any brake with pushrod travel ≥ readjustment limit for chamber type (e.g., Type 30 clamp > 1 3/4 in; Type 30 long-stroke > 2 1/2 in; Type 16/20 long-stroke > 2 in); OR any steer-axle brake defect; OR ≥ 20% of brakes on vehicle/combination defective.',
  '49 CFR 393.47(e) and tables; 49 CFR 393.53; CVSA OOS 2024 Part II Item 1 (20% rule)',
  'Route to nearest certified brake shop; do not dispatch; investigate root cause (automatic slack adjuster failure is NOT fixable by manual adjustment per 393.53).',
  'Dispatch → Maintenance Supervisor → Director of Safety',
  ARRAY['BRAKE-002','BRAKE-003','AIR-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- BRAKE-002
-- (Note: BRAKE-001 in Domain 3 context = BRKADJ-001)
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'BRAKE-002',
  'Brake lining / drum / rotor below spec',
  'equipment_vehicle_maintenance',
  'high',
  'Minimum lining thickness is defined by axle and brake type; worn drums/rotors below OEM limits fail 393.47. These defects often precede catastrophic brake failure.',
  ARRAY['lining worn','brake shoes thin','drum cracked','rotor worn','brake pads metal','grinding noise','1/4 inch lining','below wear indicator'],
  'Steer-axle drum lining < 3/16 in (or < 1/4 in in two-pad); air-disc steer < 1/8 in; non-steer drum < 1/4 in; air-disc non-steer < 1/8 in; OR drum/rotor thickness below OEM limit; OR any cracked drum.',
  '49 CFR 393.47(d), (g); CVSA OOS Part II Item 1 (defective brakes — lining/drum)',
  'Pull unit; replace foundation components per axle set; verify with CVSA-qualified inspector before return to service.',
  'Maintenance Supervisor → Director of Maintenance',
  ARRAY['BRAKE-001','BRAKE-003'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- BRAKE-003
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'BRAKE-003',
  'Catastrophic brake failure / loss of braking',
  'equipment_vehicle_maintenance',
  'critical',
  'A total or partial loss of service-brake capability is an imminent-hazard event. Driver must secure the vehicle; carrier must investigate root cause and follow accident protocols if an incident resulted.',
  ARRAY['brakes failed','no brakes','lost brakes','pedal to the floor','emergency brake only','ran into back of','couldn''t stop','spring brake locked up'],
  'Any report of partial/total service-brake loss, runaway, or emergency brake required to stop.',
  '49 CFR 393.48 (brakes in working condition); 49 CFR 396.7; 49 CFR 390.5 (accident definition); 49 CFR 382.303 (post-accident testing triggers)',
  'Driver secures unit at safe location; dispatch heavy tow — no roadside repair. If collision/injury/tow occurred, initiate accident protocol including post-accident drug/alcohol test within 8/32 hrs. Preserve DataQ evidence.',
  'Driver → Dispatch → Safety Manager → Ownership → Insurance carrier',
  ARRAY['BRAKE-001','BRAKE-002','AIR-001','WHEEL-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- AIR-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'AIR-001',
  'Air system leak exceeding FMCSA limits',
  'equipment_vehicle_maintenance',
  'high',
  'Air systems must hold pressure within FMCSA/CDL leakage limits. Excess leak rates indicate failing hoses, valves, or chambers and precede brake failure.',
  ARRAY['air leak','can''t build air','dropping PSI','hissing from chamber','audible air leak','4 psi per minute','governor cycling','tractor protection popping'],
  'Released (engine off, parking brake off): > 2 psi/min single OR > 3 psi/min combination. Service brake fully applied: > 3 psi/min single OR > 4 psi/min combination. OR low-air warning failing to trigger before 60 psi.',
  '49 CFR 393.45 (hoses/tubing); 49 CFR 393.51 (warning device < 60 psi); FMCSA CDL Manual Section 5 leakage rates; CVSA OOS Part II Item 1 (audible air leak at chamber)',
  'Stop and diagnose; replace leaking component (glad-hand, hose, chamber, valve); do not dispatch until leak rate verified within limits.',
  'Dispatch → Maintenance Supervisor',
  ARRAY['BRAKE-001','BRAKE-003'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- FAULT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FAULT-001',
  'Engine fault code SPN/FMI with active warning lamp',
  'equipment_vehicle_maintenance',
  'medium',
  'Active SPN/FMI codes posted by Samsara/Motive indicate ECM-detected faults. Severity depends on lamp state (amber warning vs. red stop) and fault category. Persistent emissions-system SPNs trigger derate cascade.',
  ARRAY['VEHICLE FAULT ALERT','New Fault Code Detected','SPN','FMI','Check Engine Light','MIL on','Vehicle Fault','warning lamp','diagnostic trouble code','DTC'],
  'Active SPN with amber CEL/MIL illuminated for > 1 hour without acknowledgment, OR any red STOP lamp at any duration.',
  'SAE J1939-71 (SPN/FMI definitions); 49 CFR 396.3(a)(1); 40 CFR 1036 Subpart B (emissions OBD)',
  'Pull telematics trouble tree; if emissions-related (3216, 3226, 4364, 4374, 5246), initiate NOX-001 / DEF-001 protocols; if red STOP, stop immediately and dispatch mobile mechanic.',
  'Dispatch → Maintenance Supervisor',
  ARRAY['NOX-001','DEF-001','DEF-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- NOX-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'NOX-001',
  'NOx sensor fault (SPN 3216 or 3226)',
  'equipment_vehicle_maintenance',
  'high',
  'NOx sensors monitor SCR efficiency per EPA 2010+. Persistent open-circuit or calibration fault triggers inducement cascade and is an explicit inducement driver under 40 CFR 1036.111(b)(4) for MY2027+.',
  ARRAY['SPN 3216','SPN 3226','NOx sensor','Aftertreatment SCR Intake NOx','Aftertreatment SCR Outlet NOx','FMI 13','FMI 9','FMI 4','NOx inlet','NOx outlet'],
  'SPN 3216 or 3226 active with FMI 2, 3, 4, 9, 10, 13, or 20, persistent across > 1 drive cycle OR paired with amber CEL for > 2 hours.',
  'SAE J1939-71 SPN definitions; 40 CFR 1036.111; Clean Air Act §203(a)(3) (anti-tampering)',
  'Schedule NOx sensor replacement at next terminal; if derate has started (paired SPN 5246/1569), route immediately to shop. Do not disconnect sensor — constitutes tampering.',
  'Maintenance Supervisor → Director of Maintenance',
  ARRAY['FAULT-001','DEF-001','DEF-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- DEF-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DEF-001',
  'DEF tank level low',
  'equipment_vehicle_maintenance',
  'medium',
  'DEF < 10% triggers MIL; < 5% triggers continuous warning; empty initiates derate cascade culminating in 5 mph limp mode. Fleet must refill before warning stage escalates.',
  ARRAY['DEF Low','DEF Level','DEF empty','Low DEF','refill DEF','AdBlue low','SPN 1761','DEF below 10'],
  'DEF level < 10% of tank capacity, OR SPN 1761 FMI 18 active.',
  '40 CFR 1036.111; ISO 22241 DEF quality (32.5% urea); EPA IACD-2025-10 guidance',
  'Driver refills with ISO 22241 DEF at next truck stop within 100 mi. If < 5%, refill immediately. Only use sealed DEF; never dilute.',
  'Driver → Dispatch',
  ARRAY['DEF-002','NOX-001','FAULT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- DEF-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DEF-002',
  'DEF system fault or derate active (SPN 4374, 5246, 1569)',
  'equipment_vehicle_maintenance',
  'critical',
  'Active inducement / derate indicates EPA-mandated power reduction. SPN 5246 FMI 0 = 5 mph limp. SPN 1569 FMI 31 indicates active torque derate. Unit must be transported to shop before inducement escalates.',
  ARRAY['SPN 5246','SPN 4374','SPN 1569','DEF Pump','SCR Inducement','Operator Inducement','Torque Derate','5 mph','Engine Derate','STOP engine lamp','red stop lamp'],
  'SPN 5246 active any FMI, OR SPN 1569 FMI 31 active, OR SPN 4374 FMI 0/1/2, OR driver reports "truck won''t go over 5 mph" / "limp mode".',
  '40 CFR 1036.111(b); SAE J1939-71; EPA IACD-2025-10; Clean Air Act §203(a)(3)',
  'If at SPN 5246 FMI 0 (5 mph), secure unit and dispatch tow; if earlier stage (FMI 15/16), route to nearest qualified diesel shop within the warning window (~1–4 hrs depending on OEM). Do not attempt to reset with scan tool without correcting root cause.',
  'Dispatch → Maintenance Supervisor → Director of Operations (load recovery) → Ownership (if tow > $2,500)',
  ARRAY['DEF-001','NOX-001','FAULT-001','BRAKE-003'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- REEFER-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'REEFER-001',
  'Reefer low fuel or unit shutdown',
  'equipment_vehicle_maintenance',
  'critical',
  'Reefer fuel below 25% on short haul or below 50% on multi-day dispatch puts cargo at risk; a shut-down reefer for > 30 min jeopardizes FSMA compliance and cargo value (typical load $75k–$300k).',
  ARRAY['reefer low fuel','reefer shutdown','Code 63','Code 17','Code 18','Code 19','Code 82','Code 84','reefer not running','temp rising','Temperature Out of Range','pull-down failed'],
  'Reefer fuel < 25% at dispatch OR < 15% in-transit; OR Thermo King red shutdown code (10, 12, 17, 18, 19, 20, 23, 63, 82, 84) active; OR return-air temp > setpoint + 10°F for > 30 min.',
  '21 CFR Part 1 Subpart O (Sanitary Transportation — FSMA); Thermo King Alarm Codes Manual TK-40933; Carrier Transicold service literature; Company Policy (carrier SOP)',
  'Driver refuels reefer immediately; if alarm shutdown, dispatch mobile reefer tech or reroute to nearest TK/Carrier dealer; notify shipper/consignee of potential temp excursion per FSMA.',
  'Driver → Dispatch → Operations Manager → Claims/Safety (if FSMA excursion)',
  ARRAY['REEFER-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- REEFER-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'REEFER-002',
  'Reefer pre-trip cycle not completed',
  'equipment_vehicle_maintenance',
  'high',
  'FSMA and carrier SOP require a pre-trip self-test and pull-down verification before loading temperature-sensitive cargo. Skipped pre-trip is a common FSMA audit finding.',
  ARRAY['pretrip skipped','no PTI','loaded hot','didn''t pre-cool','Pretrip Abort','Code 64','self test fail','didn''t cycle reefer'],
  'Cargo loaded without documented reefer pre-trip (PTI) self-test pass AND achieved pull-down to within 5°F of setpoint.',
  '21 CFR Part 1 Subpart O §1.908; Thermo King / Carrier pre-trip procedures; Company Policy',
  'Run full PTI before accepting load; document in dispatch system; if PTI fails, swap unit.',
  'Driver → Dispatch → Operations Manager',
  ARRAY['REEFER-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- TRAILER-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'TRAILER-001',
  'Trailer defect (landing gear, kingpin, ABS, conspicuity, or brakes)',
  'equipment_vehicle_maintenance',
  'high',
  'Trailer-specific defects often go undetected in tractor-focused inspections but trigger roadside OOS just as readily. Kingpin wear > 1/8 in, inoperative trailer ABS lamp (post-March 1998), broken landing gear are all violations.',
  ARRAY['kingpin worn','landing gear','dolly leg','trailer ABS','ABS light on trailer','trailer brake','reflective tape missing','conspicuity','mud flap missing'],
  'Kingpin wear > 1/8 in (SAE J700 spec); OR trailer ABS malfunction lamp illuminated on post-March-1-1998 trailer; OR landing gear bent/jammed/crank missing; OR required conspicuity tape peeled or missing > 50%.',
  '49 CFR 393.55 (trailer ABS); 49 CFR 393.11 / 393.13 (conspicuity, mud flaps); 49 CFR 393.70 (coupling); SAE J700 (kingpin); CVSA OOS Part II Items 3 & 5',
  'Pull trailer; route to trailer shop; for kingpin wear, replace kingpin assembly (not weld-repair).',
  'Dispatch → Trailer Maintenance Supervisor',
  ARRAY['COUPLE-001','LIGHT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- LIGHT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'LIGHT-001',
  'Required lamp inoperative',
  'equipment_vehicle_maintenance',
  'high',
  'Inoperable required lamps are the single most-cited CSA Vehicle Maintenance violation. Any headlamp, stop, tail, turn, clearance, identification, or license-plate lamp out when lighting is required is a violation and often an OOS.',
  ARRAY['light out','tail light','marker light','headlight out','turn signal dead','clearance lamp','lamp inoperative','bulb burned','reflector broken'],
  'Any lamp required by 393.11/393.25 non-functional during hours of darkness or reduced visibility; OR missing required reflector/conspicuity tape.',
  '49 CFR 393.9(a); 49 CFR 393.11; 49 CFR 393.25; CVSA OOS Part II Item 5',
  'Driver performs bulb/fuse swap if trained; else mobile electrical service; do not operate after dusk with inoperative required lamps.',
  'Driver → Dispatch → Maintenance',
  ARRAY['TRAILER-001','PRETRIP-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- COUPLE-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'COUPLE-001',
  'Fifth-wheel / coupling device defect',
  'equipment_vehicle_maintenance',
  'critical',
  'Fifth-wheel and kingpin engagement is life-safety critical. Cracked base plates, loose mounting bolts, improperly latched jaws, and missing safety devices are automatic OOS.',
  ARRAY['fifth wheel','jaw not locked','trailer separated','pin not engaged','tug test failed','fifth wheel cracked','slide won''t lock','mounting bolts loose'],
  'Any cracked/broken fifth-wheel component, loose/missing mounting bolt, improperly engaged jaws, failed tug test, OR free vertical/horizontal movement beyond OEM spec.',
  '49 CFR 393.70; SAE J2228 (fifth-wheel performance); CVSA OOS Part II Item 3',
  'Drop trailer on safe surface; do not couple/move; dispatch repair. If failure observed while loaded, notify dispatch before any further movement.',
  'Driver → Dispatch → Safety Manager → Maintenance',
  ARRAY['TRAILER-001','PRETRIP-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- EXH-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'EXH-001',
  'Exhaust system leak or improper discharge',
  'equipment_vehicle_maintenance',
  'high',
  'Exhaust leaks forward of or beside driver compartment create CO exposure risk and are OOS. DPF housing cracks and clamp failures are common findings on 2010+ engines.',
  ARRAY['exhaust leak','DPF cracked','loud exhaust','fumes in cab','CO detected','exhaust clamp','tailpipe loose','muffler leak'],
  'Any exhaust leak forward of, below, or to right of driver/sleeper compartment; OR exhaust components loose/cracked; OR tailpipe discharge location non-compliant.',
  '49 CFR 393.83(a)-(g); CVSA OOS Part II Item 8',
  'Pull unit immediately (driver health risk); route to diesel shop; replace clamps/gaskets/DPF housing as required.',
  'Dispatch → Maintenance Supervisor → Safety Manager',
  ARRAY['FAULT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- SECURE-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'SECURE-001',
  'Cargo securement inadequate (tiedown count / WLL / damaged devices)',
  'equipment_vehicle_maintenance',
  'critical',
  'Flat/step-deck loads must meet aggregate WLL ≥ 50% of cargo weight with correct tiedown count and undamaged devices. Lost-load incidents are catastrophic; this is a top-five vehicle OOS category.',
  ARRAY['not enough straps','chain cut','strap torn','binder loose','load shifted','tiedown damaged','straps short','edge protection missing','WLL'],
  'Aggregate WLL < 50% of cargo weight; OR fewer than required tiedowns (1 if ≤ 5 ft & ≤ 1,100 lb; 2 if ≤ 10 ft; +1 per additional 10 ft); OR any strap with cut/knot/burn exceeding 393.104(f)(4) table; OR chain with stretched/cracked/bent links; OR missing edge protection on abrasive corners.',
  '49 CFR 393.104; 49 CFR 393.106; North American Cargo Securement Standard; CVSA OOS Part II Item 4',
  'Driver adds/replaces tiedowns before departure; if in transit, driver pulls to safe location and re-secures; never exceed WLL.',
  'Driver → Dispatch → Safety Manager',
  ARRAY['PRETRIP-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- WHEEL-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'WHEEL-001',
  'Wheel-off risk / loose or missing lug nut, broken stud, or missed retorque',
  'equipment_vehicle_maintenance',
  'critical',
  'Wheel separations are catastrophic and often fatal. Loose/missing lug nuts, rust streaking, broken studs, and missed retorque intervals after wheel service are leading indicators.',
  ARRAY['lug nut loose','rust streak','missing lug','wheel wobble','lug broken','wheel off','stud broken','Checkpoint indicator','retorque overdue','loose wheel'],
  'Any loose, missing, broken, or cracked wheel fastener; OR missed retorque at 50–100 mi post-service and 10,000-mi interval per TMC RP 237C; OR visible rust streaking from stud/nut; OR cracked rim.',
  '49 CFR 393.205 (wheels); TMC RP 237C Torque Checking Guidelines for Disc Wheels; CVSA OOS Part II Item 11; 49 CFR 390.5 (accident definition — wheel-off causing injury/tow = DOT recordable)',
  'Stop immediately; do not move unit; dispatch mobile tire/wheel service with torque wrench (450–500 ft-lb for 33 mm hub-piloted); reinstall per TMC RP; document root cause (corrosion, torque procedure, stud fatigue); if wheel separated, initiate accident protocol.',
  'Driver → Dispatch → Safety Manager → Director of Maintenance → Ownership',
  ARRAY['TIRE-002','BRAKE-003'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;


-- =============================================================================
-- Domain 4: Load & Cargo Operations -- 25 rules
-- Collisions resolved: REEFER-001->RFSET-001, REEFER-002->RFSET-002,
--                      SECURE-001->WLLSEC-001
-- All internal cross-references within Domain 4 updated to match.
-- =============================================================================

-- WEIGHT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'WEIGHT-001',
  'Federal 80,000 lb Gross Vehicle Weight Ceiling',
  'load_cargo_operations',
  'critical',
  'Any combination vehicle exceeding 80,000 lb gross on Interstate highways without a valid state overweight permit is an immediate federal violation. Driver must be routed to the nearest certified scale before further movement if overweight is suspected at pickup or post-weigh-in.',
  ARRAY['overweight','heavy load','scaled 80','scaled at','over gross','CAT scale','82,000','81,500','gross weight ticket','over by'],
  'Gross combination weight > 80,000 lb on Interstate without state-issued overweight permit; or any reported scale ticket value >= 80,001 lb.',
  '23 CFR 658.17; FHWA Federal-Aid Highway weight limits.',
  'Instruct driver not to leave scale; request axle-by-axle ticket; route to shipper for partial unload or initiate state overweight permit if commodity is nondivisible.',
  'dispatch -> safety -> operations',
  ARRAY['AXLE-001','AXLE-002','PERMIT-001','WEIGHT-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- WEIGHT-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'WEIGHT-002',
  'Uneven Load Distribution and Overload Indicators',
  'load_cargo_operations',
  'high',
  'Drivers reporting tire bulge, squatting suspension, trailer leaning, or handling/pull issues indicate overload or weight concentrated on one axle group. Condition creates blowout, rollover, and bridge-law risk even when gross is legal.',
  ARRAY['trailer squatting','tires bulging','leaning to one side','pulling hard','rear heavy','nose heavy','feels overloaded','axle scaled heavy','one side lower','suspension bottomed'],
  'Any axle group exceeds its federal limit while gross <= 80,000 lb; OR visible side-to-side trailer lean; OR drive/trailer tandem split > 2,000 lb off balance on a uniform-density load.',
  '49 CFR 392.9 (load securement/distribution); 23 CFR 658.17; FHWA Bridge Formula.',
  'Stop at next safe location, re-scale by axle, slide tandems or return to shipper for restack before continuing.',
  'dispatch -> safety -> operations',
  ARRAY['WEIGHT-001','AXLE-001','AXLE-002','SHIFT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- AXLE-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'AXLE-001',
  'Steer Axle 12,000 lb Federal Ceiling',
  'load_cargo_operations',
  'high',
  'Steer axle exceeding 12,000 lb compromises steering control and tire rating on most OEM setups. Typical cause is nose-heavy load or insufficient 5th-wheel slide. Requires correction before leaving scale or shipper.',
  ARRAY['steer over','steers 12','steer axle heavy','12,400 steer','nose heavy','front axle over','steer scaled'],
  'Steer axle > 12,000 lb on Interstate; or > tire/axle manufacturer rating where lower (e.g., 12,000 lb tire rating on 295/75R22.5).',
  '23 CFR 658.17; FHWA Bridge Formula Table B; FMVSS 120 tire load ratings.',
  'Slide 5th wheel rearward one hole at a time and re-scale; if already maxed, have shipper restack pallets toward rear.',
  'dispatch -> safety',
  ARRAY['WEIGHT-001','AXLE-002','WEIGHT-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- AXLE-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'AXLE-002',
  '34,000 lb Tandem Ceiling and Bridge Formula Compliance',
  'load_cargo_operations',
  'critical',
  'Either tandem group over 34,000 lb, or any axle spacing failing Federal Bridge Formula W = 500[(LN/(N-1))+12N+36], is a bookable violation at any open scale. Sliding tandems forward shifts weight to drives; sliding rearward shifts to trailer tandems.',
  ARRAY['drives heavy','tandems over','34,600 drives','trailer tandems scaled','bridge law','tandem spread','slide tandems','over on drives','over on trailer'],
  'Drive tandem > 34,000 lb OR trailer tandem > 34,000 lb OR combined axle weight across any consecutive axle group fails Bridge Formula computation.',
  '23 CFR 658.17; Federal Bridge Formula (23 USC 127).',
  'Slide tandems one notch (~500 lb per hole shifts) toward the lighter group; re-scale; if bridge-limited, require shipper to redistribute pallets.',
  'dispatch -> safety -> operations',
  ARRAY['WEIGHT-001','AXLE-001','WEIGHT-002','PERMIT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- PERMIT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'PERMIT-001',
  'State-Specific Overweight Permit Trigger',
  'load_cargo_operations',
  'high',
  'Loads exceeding federal weight or state axle limits on nondivisible cargo require a state-issued overweight permit for every state on the route. Permits are state-specific, expire, and typically lock routing and travel hours.',
  ARRAY['need permit','permit load','nondivisible','heavy haul','state permit expired','overweight permit','superload','permit route','no travel Sunday'],
  'Load weight exceeds the destination/transit state''s legal limit AND no active permit on file; OR permit expired before ETA; OR driver deviates from permitted route.',
  'State DOT permit offices (e.g., TxDMV, CalTrans TPD, NY DOT OSOW); 23 CFR 658.17 (federal baseline).',
  'Halt movement; confirm permit is issued, current, and covers every state/route segment; attach permit PDF to load record before driver proceeds.',
  'dispatch -> operations -> safety',
  ARRAY['WEIGHT-001','AXLE-002','OVER-001','OVER-002','PILOT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- OVER-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'OVER-001',
  'Oversize Dimensional Permit Triggers',
  'load_cargo_operations',
  'high',
  'Any load exceeding 8''6" wide, 13''6" high, or 53'' trailer length requires an oversize permit in every transit state. Height exceedance is the most common cause of bridge strikes and must be verified before departure.',
  ARRAY['over width','9 feet wide','14 feet tall','oversize','wide load','tall load','low bridge','13''8"','overlength','over 53'],
  'Width > 102 in (8''6"); OR height > 162 in (13''6"); OR trailer length > 53 ft; OR overhang > 4 ft front / 4 ft rear without flag/light, while operating without active oversize permit.',
  '23 CFR 658.15 (length); 23 CFR 658.16 (width); state DOT height limits; FMCSA Â§393.11 (lights/reflectors).',
  'Measure load with tape before departure; obtain state oversize permit; affix red flags (18"x18") and signage; verify routing avoids posted low-clearance structures.',
  'dispatch -> operations',
  ARRAY['PERMIT-001','OVER-002','PILOT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- OVER-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'OVER-002',
  'Super Load Classification (>16'' Wide)',
  'load_cargo_operations',
  'critical',
  'Loads over approximately 16'' wide, 16'' high, or 150,000 lb gross fall into super load category. These require engineered route surveys, utility coordination, police escort in many states, and multi-week lead times.',
  ARRAY['super load','superload','16 feet wide','route survey','utility lift','police escort','over 150000','engineered route'],
  'Width >= 16 ft OR height >= 16 ft OR gross >= 150,000 lb OR length >= 120 ft (varies by state) without approved super load permit, route survey, and required escorts.',
  'State DOT super load statutes (e.g., TxDMV Rule Â§219.11, PennDOT Pub 194); SC&RA Permit Manual 2024.',
  'Do not dispatch until state-approved route survey, utility notifications, police escorts, and permit are in hand; notify ownership on all super-load bookings.',
  'operations -> ownership -> safety',
  ARRAY['OVER-001','PERMIT-001','PILOT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- PILOT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'PILOT-001',
  'Pilot Car Escort Thresholds by State',
  'load_cargo_operations',
  'high',
  'Most states mandate at least one certified pilot car when load exceeds ~12'' wide or ~15'' high, with a second high-pole escort for height above ~14''6". Missing escort at a weigh station voids the permit.',
  ARRAY['pilot car','escort vehicle','high pole','P/C no show','escort missing','lost my escort','12 feet wide','height pole'],
  'Load width > 12 ft or height > 14''6" moving without required front/rear pilot car; OR pilot car not certified per state requirements; OR high-pole escort absent when load height >= 14''6".',
  'State-specific (e.g., Ohio Admin Code 5501:2-1-09; WashDOT TE 420.04); SC&RA Pilot Car Operator Best Practices 2024.',
  'Park load at safe staging; arrange certified pilot car before continuing; verify escort credentials and radio contact.',
  'dispatch -> operations',
  ARRAY['OVER-001','OVER-002','PERMIT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- WLLSEC-001 (renamed from SECURE-001 to avoid collision with equipment_vehicle_maintenance domain)
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'WLLSEC-001',
  'Aggregate Working Load Limit Must Equal 50% of Cargo Weight',
  'load_cargo_operations',
  'critical',
  'The sum of the WLL of all tie-downs, chains, binders, and anchor points must equal or exceed one-half the weight of the secured cargo. Mismatched WLL (e.g., Grade 70 chain on Grade 43 binder) is governed by the lowest component.',
  ARRAY['WLL','working load limit','50 percent','chain grade','binder','rated at','straps only','four straps','need more straps','securement short'],
  'Sum of WLL of all securement devices < 0.50 x cargo weight in lb; OR any single device/anchor rated below the device it connects to.',
  '49 CFR 393.106(d); CVSA North American Cargo Securement Standard 2024.',
  'Add straps/chains until aggregate WLL >= 50% of commodity weight; match all binder, strap, and anchor grades to the weakest component.',
  'dispatch -> safety',
  ARRAY['SECURE-002','SECURE-003','SHIFT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- SECURE-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'SECURE-002',
  'Tie-Down Count Rule -- Length and Weight Minimums',
  'load_cargo_operations',
  'high',
  'Federal rule requires at least one tie-down per 10 ft of article length. Articles <= 5'' and <= 1,100 lb need 1 tie-down; <= 5'' and > 1,100 lb or > 5'' but <= 10'' need 2; every additional 10 ft (or fraction) requires one more.',
  ARRAY['one strap','two straps','three straps','coil','pipe load','lumber bundle','steel plate','20 foot article','short a strap'],
  'Tie-down count < (1 per 10 ft of article length, rounded up), with minimum of 2 for any article > 5 ft or > 1,100 lb; OR commodity-specific minimum (logs, metal coils, paper rolls per 49 CFR 393.116-393.136) not met.',
  '49 CFR 393.110; commodity-specific 49 CFR 393.116-393.136.',
  'Recount articles and tie-downs against the 10-ft rule; add straps before moving; for coils and logs apply commodity-specific minimums.',
  'dispatch -> safety',
  ARRAY['WLLSEC-001','SECURE-003','TARP-001','SHIFT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- SECURE-003
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'SECURE-003',
  'Flatbed / Step Deck Edge Protection Requirement',
  'load_cargo_operations',
  'high',
  'Any tie-down contacting a sharp commodity edge (steel, concrete, crated goods) requires edge/corner protection that resists cutting, abrasion, and crushing. Missing edge protection is a frequent CVSA Level 1 OOS violation.',
  ARRAY['strap cut','corner protector','edge protection','V-board','dunnage','strap frayed','rubbing edge','cut strap','no corners'],
  'Any strap in contact with an edge capable of cutting/crushing/abrading without a protector; OR missing dunnage between stacked articles that can shift; OR edge protector load rating < strap WLL.',
  '49 CFR 393.104(b); CVSA OOS Criteria 2025.',
  'Install V-boards or corner protectors at every contact point before departure; carry minimum 8 spares per flatbed/step deck.',
  'dispatch -> safety',
  ARRAY['WLLSEC-001','SECURE-002','TARP-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- TARP-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'TARP-001',
  'Commodity Tarping and Wind-Load Integrity',
  'load_cargo_operations',
  'medium',
  'Lumber, drywall, steel coils with paper wrap, machinery sensitive to moisture, and most customer-specified freight require a tarp in good condition. Damaged or improperly secured tarps create wind-load separation, road hazards, and claim exposure.',
  ARRAY['tarp ripped','tarp torn','no tarp','tarp flapping','wind damage','6x8 tarp','8x8 tarp','smoke tarp','steel tarp','lumber tarp'],
  'Tarp required by BOL/commodity but absent; OR tears > 12" unpatched; OR grommets/straps missing such that > 1 linear foot of cargo edge is exposed; OR tarp flapping visibly in mirrors at highway speed.',
  '49 CFR 393.100(b) (cargo protection from environment); customer BOL/load tender specifications.',
  'Stop at next safe location; re-secure tarp with bungees and straps every 4 ft; if torn beyond repair, obtain replacement before continuing.',
  'dispatch -> safety',
  ARRAY['SECURE-002','SECURE-003','SHIFT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- SHIFT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'SHIFT-001',
  'Mid-Transit Cargo Shift Protocol',
  'load_cargo_operations',
  'critical',
  'Reports of load shifting -- strap looseness, audible banging, trailer sway, or handling changes -- indicate imminent securement failure. Driver must stop at next safe location, photograph, and re-secure before continuing.',
  ARRAY['load shifted','shift in back','strap loose','banging in trailer','trailer swaying','pallets fell','load moved','hearing shifting','loose chain'],
  'Any driver report of audible/visual shift; OR strap tension visibly slack on inspection; OR trailer lean > 2 degrees during transit.',
  '49 CFR 392.9(b)(3) -- driver duty to examine securement; 49 CFR 393.100.',
  'Tori tells driver: pull over at next safe exit/truck stop, photograph load, re-tension all tie-downs, add straps if needed, document in load file; if unsafe to re-secure alone, request roadside assistance.',
  'dispatch -> safety -> claims',
  ARRAY['WLLSEC-001','SECURE-002','SECURE-003','WEIGHT-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- RFSET-001 (renamed from REEFER-001 to avoid collision with equipment_vehicle_maintenance domain)
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'RFSET-001',
  'Reefer Setpoint by Commodity Class',
  'load_cargo_operations',
  'critical',
  'Each commodity class has a narrow defensible temperature range. Operating outside these bands triggers claims, FDA Sanitary Transportation Rule exposure, and customer chargebacks. Setpoint must be verified against BOL before sealing trailer.',
  ARRAY['setpoint','set at','running at','reefer 34','reefer temp','frozen load','produce load','pharma load','ice cream','meat load','dairy load'],
  'Setpoint outside commodity band: frozen -10F to 0F; ice cream <= -10F; most produce/dairy 34-38F; pharma 36-46F (or per product insert); fresh meat/poultry 28-32F. Any setpoint outside the BOL-specified range is a violation.',
  '21 CFR 1.908 (FSMA Sanitary Transportation); USDA FSIS Directive 6700.1; IARW Refrigerated Warehousing Handbook 2024; PMA produce temperature recommendations.',
  'Compare BOL temp spec to reefer display; correct setpoint before driver departs shipper; photograph setpoint and BOL side-by-side.',
  'dispatch -> operations -> claims',
  ARRAY['PRECOOL-001','TEMP-001','RFSET-002','REEFER-003','FSMA-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- RFSET-002 (renamed from REEFER-002 to avoid collision with equipment_vehicle_maintenance domain)
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'RFSET-002',
  'Three-Temperature Distinction and Diagnostic Logic',
  'load_cargo_operations',
  'high',
  'Setpoint is the target; supply air is what leaves the evaporator into the trailer; return air is what comes back to the unit after passing the cargo. A large delta between supply and return indicates airflow blockage, door seal failure, or under-precool.',
  ARRAY['return air','supply air','delta T','discharge temp','return 45','supply 32','reefer spread','air gap','chute blocked'],
  '|Return - Supply| > 7F on a stabilized load (beyond 2 hours from loading) for frozen or produce; OR return air > setpoint + 5F for more than 60 min; OR supply air tracking setpoint but return diverging (indicates load-side issue).',
  'Thermo King / Carrier Transicold operator manuals 2024; ATA Refrigerated Division Best Practices.',
  'Driver checks air chute integrity, load stack height (no blocking return bulkhead), and door seals; if delta persists, dispatch Thermo King / Carrier service and notify broker.',
  'dispatch -> operations -> claims',
  ARRAY['RFSET-001','REEFER-003','TEMP-001','PRECOOL-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- REEFER-003
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'REEFER-003',
  'Run Mode Selection by Commodity',
  'load_cargo_operations',
  'high',
  'Fresh produce, pharma, cut flowers, and any commodity needing constant airflow must run in Continuous mode. Frozen, dry, and some dairy can run Cycle Sentry / Start-Stop for fuel savings. Wrong mode is a leading cause of top-layer damage claims on produce.',
  ARRAY['cycle sentry','start stop','continuous run','CYCL SNTR','unit cycling','reefer off','stopped cycling','fuel save mode'],
  'Cycle Sentry / Start-Stop enabled on fresh produce, pharmaceuticals, fresh-cut flowers, or any load where BOL specifies "Continuous"; OR continuous run not enabled when customer contract requires it (e.g., most grocery, all Rx).',
  '21 CFR 1.908(b)(1) (temperature control); customer-specific (Kroger, HEB, CVS) tender instructions; Thermo King SB/SLXi operator manual.',
  'Switch unit to Continuous mode, confirm via display, photograph and send to dispatch; annotate load record.',
  'dispatch -> operations',
  ARRAY['RFSET-001','RFSET-002','TEMP-001','FSMA-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- PRECOOL-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'PRECOOL-001',
  'Pre-Cool to Setpoint Before Loading',
  'load_cargo_operations',
  'high',
  'Reefer trailer must reach commodity setpoint and hold for at least 60 minutes before doors open for loading. Loading a warm trailer introduces ambient heat the unit cannot pull down during transit and is the most common cause of produce claims.',
  ARRAY['precool','pre-cool','pre cool','not cold','trailer warm','reefer warm','pulling down','at dock','live load','just turned on'],
  'Door opens for loading while return air > setpoint + 10F; OR total pre-cool runtime < 60 min before loading begins; OR fresh produce loaded into trailer reading > 45F at start of loading.',
  '21 CFR 1.908(b)(1); FDA FSMA Sanitary Transportation of Human and Animal Food Rule; PMA Cold Chain Guidelines 2024.',
  'Driver refuses door-open until trailer stabilized at setpoint for >= 60 min; photograph unit display; notify dispatch and shipper.',
  'dispatch -> operations -> claims',
  ARRAY['RFSET-001','RFSET-002','TEMP-001','FSMA-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- TEMP-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'TEMP-001',
  'Temperature Excursion > 30 Minutes Triggers Claim Protocol',
  'load_cargo_operations',
  'critical',
  'Most customer contracts (Amazon Fresh, Walmart, Kroger, McKesson) treat 30 continuous minutes outside the spec temperature band as a reportable excursion. Tori must capture downloadable reefer data, notify broker immediately, and preserve chain of custody to defend the claim.',
  ARRAY['Temperature Alarm','Setpoint Deviation','High Temp Alarm','Low Temp Alarm','Reefer Fuel Low','out of range','excursion','temp alert','alarm code','return air high'],
  'Return air continuously outside commodity spec band for >= 30 min; OR any single reading > spec + 10F (severe); OR reefer fuel < 1/4 tank with > 500 mi remaining.',
  '21 CFR 1.908; customer contracts (Amazon Freight Temperature Policy 2024, Walmart Routing Guide Â§6.4).',
  'Tori alerts driver, dispatch, and customer service simultaneously; pull DAS/Thermo King download; do not break seal; contact broker within 30 min of excursion end for disposition instructions.',
  'dispatch -> operations -> claims -> customer_service',
  ARRAY['RFSET-001','RFSET-002','REEFER-003','PRECOOL-001','FSMA-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- SEAL-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'SEAL-001',
  'Seal Integrity and Break-With-Witness Protocol',
  'load_cargo_operations',
  'critical',
  'Seal number on BOL must match physical seal at pickup, every intermediate stop, and final delivery. Any seal break requires a witness, photos, timestamped note, and a replacement high-security (ISO 17712) seal with the new number reported to broker before re-departure.',
  ARRAY['broken seal','seal missing','seal number','wrong seal','seal cut','reseal','new seal','no seal','seal tampered','seal doesn''t match'],
  'Seal number on trailer != seal number on BOL at any checkpoint; OR seal missing/damaged without documented witness and replacement; OR seal replaced by driver alone without broker authorization.',
  'C-TPAT Minimum Security Criteria 2024; ISO 17712 High-Security Seals; customer-specific (Costco, Target) seal policies.',
  'Do not break seal without broker approval; if already broken, photograph immediately, obtain witness signature (dock manager/LEO), affix new ISO 17712 seal, notify broker and customer service with both seal numbers.',
  'dispatch -> operations -> customer_service -> claims',
  ARRAY['BOL-001','THEFT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- THEFT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'THEFT-001',
  'CargoNet High-Theft Commodity Handling',
  'load_cargo_operations',
  'critical',
  'CargoNet 2024-2025 reports identify electronics, pharmaceuticals, tobacco, alcohol, cosmetics/personal care, and copper/metals as highest-theft commodities. These loads require no-stop 200-mile first leg, team drivers or secured yard overnight, king-pin lock, and live tracking.',
  ARRAY['electronics load','pharma load','tobacco','cigarettes','alcohol load','liquor','beer load','cosmetics','copper','high value','king pin lock','team drivers','secured yard'],
  'Listed commodity dispatched without: (a) 200-mile no-stop policy from origin, (b) king-pin lock, (c) active GPS tracking, OR (d) overnight park outside TSA/CargoNet approved secured yard.',
  'CargoNet Annual Cargo Theft Report 2024-2025; TAPA TSR Trucking Security Requirements 2024; customer-specific (pharma clients require TSA SecurePack).',
  'Confirm king-pin lock installed, GPS ping active, driver briefed on 200-mile rule and approved overnight yard list; alert ownership on any deviation.',
  'dispatch -> safety -> operations -> ownership',
  ARRAY['SEAL-001','BOL-001','AMZ-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- FSMA-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FSMA-001',
  'FSMA Sanitary Transportation Rule Compliance',
  'load_cargo_operations',
  'high',
  'Carriers hauling human or animal food must provide trailers clean of previous load residue and odor, maintain written sanitation SOPs, train drivers on allergen cross-contact, and honor shipper-specified temperature, cleaning, and prior-load restrictions.',
  ARRAY['prior load','wash out','trailer dirty','odor in trailer','food grade','FSMA','allergen','hazmat in trailer','previous load','kosher wash','chemical residue'],
  'Food load accepted in trailer with visible residue, odor, or documented prior non-food-compatible load (chemicals, hazmat, raw animal products) without approved wash-out; OR driver not trained per 21 CFR 1.910; OR records not retained 12 months.',
  '21 CFR 1.900-1.934 (FSMA Sanitary Transportation of Human and Animal Food Rule).',
  'Reject the load until wash-out is completed and receipt is attached to load record; verify prior-load history in TMS; confirm driver FSMA training date current within 12 months.',
  'dispatch -> safety -> operations',
  ARRAY['RFSET-001','PRECOOL-001','TEMP-001','HAZSEG-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- HAZSEG-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'HAZSEG-001',
  'Hazmat Segregation Table Compliance',
  'load_cargo_operations',
  'critical',
  '49 CFR 177.848 prohibits specific hazmat combinations on the same vehicle (e.g., oxidizers with flammable liquids; cyanides with acids; Class 1.1 with most other classes). Violations are DOT recordable and can result in criminal referral.',
  ARRAY['hazmat','placard','class 3','class 8','oxidizer','UN number','segregation','mixed load hazmat','corrosive and flammable','cyanide','acid and base'],
  'Two or more hazmat classes loaded together that are marked "X" or "O" (incompatible) in the 49 CFR 177.848(d) segregation table; OR placards missing or incorrect; OR hazmat loaded with food without compliant barrier.',
  '49 CFR 177.848; PHMSA Hazmat Safety Permit; 49 CFR 172 Subpart F (placarding).',
  'Refuse load until shipper separates incompatible classes onto different trailers; verify driver has current hazmat endorsement; confirm placards match shipping papers.',
  'dispatch -> safety -> operations -> ownership',
  ARRAY['FSMA-001','BOL-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- AMZ-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'AMZ-001',
  'Amazon Relay On-Time and Equipment Standards',
  'load_cargo_operations',
  'high',
  'Amazon Relay requires 53'' dry van in good condition (no leaks, <= 5-year-old swing doors, clean interior), on-time arrival within a 15-minute window of appointment, continuous GPS visibility via Relay app, and scorecard compliance on On-Time Performance, Acceptance, and Adherence.',
  ARRAY['Relay','Amazon load','VRID','arrive by','15 minute window','Relay app','tracking dropped','scorecard','bounced load','AZ-','amazon freight'],
  'Arrival > 15 min before or > 15 min after appointment; OR trailer not 53'' dry van in Relay-eligible condition; OR Relay app tracking off > 15 min during dispatch; OR On-Time Performance scorecard < 95%, Acceptance < 95%, or In-Transit Updates < 98%.',
  'Amazon Relay Carrier Terms of Service 2024; Amazon Freight Carrier Scorecard published metrics.',
  'Re-sequence ETA to land inside 15-min window; if tracking dropped, driver must reopen Relay app and confirm ping; dispatch monitors scorecard daily and corrects drivers on violations.',
  'dispatch -> operations -> customer_service',
  ARRAY['RETAIL-001','BOL-001','THEFT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- RETAIL-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'RETAIL-001',
  'Big-Box Retailer Delivery and OTIF Standards',
  'load_cargo_operations',
  'high',
  'Walmart OTIF requires 98% on-time and in-full at the case level with chargebacks of 3% of COGS per violation. Target Grow Your Supply Chain requires +/-30-minute appointment adherence. Costco requires +/-15-minute window, SSCC/GS1-128 labeling, and pallet-count accuracy.',
  ARRAY['Walmart OTIF','OTIF fail','Target appt','Costco delivery','DC appointment','chargeback','MABD','SSCC label','pallet count short','delivery window','early arrival'],
  'Walmart arrival outside MABD (Must Arrive By Date) window or short case count; OR Target arrival > 30 min off appointment; OR Costco arrival > 15 min off appointment; OR missing/invalid SSCC GS1-128 labels.',
  'Walmart Supplier OTIF Policy 2024; Target Grow Your Supply Chain Routing Guide 2024; Costco Supplier Compliance Manual 2024.',
  'Tori monitors appointment window T-60 min; if risk of miss, dispatch calls DC for reschedule and notifies broker before MABD; verify SSCC labels photographed at pickup.',
  'dispatch -> operations -> customer_service',
  ARRAY['AMZ-001','BOL-001','TEMP-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- BOL-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'BOL-001',
  'BOL Count, Condition, and SLC vs Driver Count Distinction',
  'load_cargo_operations',
  'high',
  'At pickup the driver must verify piece count, visible condition, description, and seal against the BOL. If the trailer is shipper-loaded and the driver is not allowed to count, the BOL must be annotated "SLC" (Shipper Load and Count) to shift count liability; absent SLC annotation, driver count governs the claim.',
  ARRAY['BOL','bill of lading','shipper load and count','SLC','driver count','piece count','damaged pallet','short count','overage','exception','couldn''t count','sealed at dock'],
  'Driver signed BOL clean without SLC notation on shipper-loaded/sealed trailer; OR piece count on BOL != actual count and no exception noted; OR visible damage/condition not noted at pickup; OR description on BOL does not match placards/commodity observed.',
  '49 CFR 373.101 (motor carrier receipts/BOL); Uniform Straight Bill of Lading terms; Carmack Amendment (49 USC 14706).',
  'Driver annotates "SLC -- Shipper Load and Count -- Seal #XXXX applied, driver unable to verify pieces" before signing; photograph BOL front and back; upload to TMS within 30 min of departure.',
  'dispatch -> operations -> claims',
  ARRAY['SEAL-001','THEFT-001','AMZ-001','RETAIL-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;


-- =============================================================================
-- Domain 5: Broker & Customer Relations -- 25 rules
-- Collisions resolved: SCORE-001->BRSCORE-001 (conflicts with driver_safety_behavior),
--                      BOL-001->BRBOL-001 (conflicts with load_cargo_operations)
-- All internal cross-references within Domain 5 updated to match.
-- =============================================================================

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'RATE-001',
  'Rate Confirmation standard clause verification',
  'broker_customer_relations',
  'high',
  'Every Rate Con must contain the nine required commercial terms before a driver is dispatched: total linehaul rate, total miles, pickup address/date/time window, delivery address/date/time window, commodity description, weight, equipment type, accessorial schedule, and broker MC/DOT with billing address. Missing terms create payment disputes and expose the carrier to unenforceable claims.',
  ARRAY['rate con signed','ratecon received','rate confirmation attached','pickup number','delivery appointment','linehaul','total miles','commodity','no rate listed'],
  'Rate Con missing any of: linehaul rate (numeric $), total miles, pickup address + date/time, delivery address + date/time, commodity + weight, equipment type, broker MC#, billing address, or accessorial schedule. Any single missing field = violation.',
  '49 CFR 371.3 (broker records); TIA Carrier-Broker Agreement Standard; FMCSA Broker Regulations',
  'Do not dispatch driver. Reply to broker requesting missing fields in writing; update Rate Con before signature. Archive final signed copy to load file.',
  'dispatch -> operations',
  ARRAY['RATE-002','RATE-003','COMM-001','ACCESS-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'RATE-002',
  'Rate Confirmation red-flag detection',
  'broker_customer_relations',
  'critical',
  'A Rate Con with a missing MC number, no billing address, vague commodity description, or a rate materially divergent from DAT market average signals fraud, double-brokering, or an unlicensed broker. These loads carry elevated non-payment and cargo-loss risk and must be vetted before dispatch.',
  ARRAY['no MC listed','MC pending','billing address TBD','general freight','FAK','rate looks high','too good to be true','broker won''t share MC','rate con incomplete'],
  'Any of: (a) MC# missing or unverifiable on SAFER; (b) no billing address or PO box only; (c) commodity described only as "general freight," "FAK," or "misc"; (d) offered rate >25% above or >20% below 7-day DAT lane average for the equipment class.',
  '49 CFR 371.3; FMCSA SAFER system; DAT RateView benchmarks (2024-2026)',
  'Halt dispatch. Run MC on SAFER and credit services (Ansonia/RMIS/Highway). Require broker to supply complete billing info and specific commodity. Escalate if unresolved.',
  'dispatch -> operations -> ownership',
  ARRAY['RATE-001','CRED-001','BLIST-001','DBROKER-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'RATE-003',
  'Unauthorized Rate Con modifications after signing',
  'broker_customer_relations',
  'high',
  'Once both parties sign a Rate Con, any change â€” rate reduction, added stop, extended appointment, new accessorial terms â€” requires a written addendum countersigned by operations. Brokers that send "revised" PDFs mid-transit frequently do so to suppress detention, TONU, or layover payable.',
  ARRAY['revised rate con','updated ratecon','new version attached','rate adjusted','added stop','changed appointment','please re-sign','corrected ratecon','amended'],
  'Any post-signature change to rate, mileage, stops, appointment, commodity, or accessorial schedule without a countersigned addendum from operations and matching broker signature.',
  'TIA Carrier-Broker Agreement Standard; Company Policy; UCC 2-209 (contract modification)',
  'Do not sign revised Rate Con without operations approval. Reply to broker quoting the original signed version. Preserve both PDFs in the load file with timestamps.',
  'dispatch -> operations -> accounting',
  ARRAY['RATE-001','RATE-002','COMM-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DET-001',
  'Detention free-time thresholds at shipper and consignee',
  'broker_customer_relations',
  'medium',
  'Industry standard grants 2 hours of free loading time at the shipper and 2 hours of free unloading time at the consignee, measured from scheduled appointment time (or driver arrival, whichever is later). The detention clock starts at minute 121 and must be documented in real time.',
  ARRAY['still waiting','been here 3 hours','detention started','in the door','not loaded yet','dock door','arrived at shipper','arrived at receiver','no dock assigned'],
  'Driver on-site >2.0 hours past appointment (or arrival if earlier than appointment) without loading/unloading complete = detention trigger. Reefer and hazmat loads may carry 1-hour free time per Rate Con.',
  'FMCSA Detention Study (2018, reaffirmed 2023); TIA Detention Best Practices; DAT industry benchmarks',
  'At 1:45 elapsed, instruct driver to photograph in-gate time and dock. At 2:01, send detention-start notice to broker with BOL and timestamps. Start billing clock per DET-002.',
  'dispatch -> operations',
  ARRAY['DET-002','DET-003','LAY-001','ACCESS-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DET-002',
  'Detention billing rate by equipment type',
  'broker_customer_relations',
  'medium',
  'Detention is billed per hour beyond free time and scales with equipment risk and opportunity cost. Tori flags any Rate Con accessorial schedule that falls below these floors or any settlement that underpays the contracted rate.',
  ARRAY['detention rate','$50 per hour','$75 per hour','$100 per hour','detention cap','accessorial schedule','detention pay','broker detention offer'],
  'Detention rate on Rate Con or settlement below: $50/hr dry van, $60-75/hr reefer, $75-100/hr flatbed/step deck, $100+/hr hazmat/specialized. Daily cap under $600 dry van / $800 reefer / $1,000 flatbed/hazmat is also a violation.',
  'DAT Detention Benchmarks 2024-2025; FreightWaves SONAR; NASTC carrier operations surveys',
  'Flag low-rate accessorial schedules before signing. On settlement shortfall, send itemized dispute to broker within 24 hours citing Rate Con line.',
  'dispatch -> accounting -> operations',
  ARRAY['DET-001','DET-003','ACCESS-001','LAY-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DET-003',
  'Detention documentation and claim submission window',
  'broker_customer_relations',
  'high',
  'A detention claim is only collectible with contemporaneous evidence: BOL in/out timestamps signed by shipper or receiver, driver photos of arrival and departure (geotagged or timestamped), and email confirmation to the broker. Claims must be submitted within the Rate Con window â€” typically 24-48 hours â€” or they become uncollectible regardless of merit.',
  ARRAY['detention paperwork','BOL timestamp','in-time out-time','driver photos','detention claim submitted','broker won''t pay detention','detention denied','past the window','48 hour window'],
  'Detention claim submitted without: (a) BOL showing both in-time and out-time signed by facility, (b) driver timestamped photos of arrival and departure, and (c) email to broker. Claim filed >48 hours (or Rate Con-specified window) after departure.',
  'TIA Detention Claim Best Practices; Rate Con contract terms; Company Policy',
  'Submit detention claim within 24 hours with BOL in/out times, two driver photos, and itemized hours x rate. CC accounting. If broker rejects, escalate within 5 business days.',
  'dispatch -> accounting -> operations',
  ARRAY['DET-001','DET-002','BRBOL-001','COMM-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'LAY-001',
  'Layover pay trigger and rate by equipment',
  'broker_customer_relations',
  'high',
  'Layover is distinct from detention: it triggers when a driver is held past appointment by >=24 hours, forcing an overnight with truck, trailer, and HOS clock immobilized. Daily layover pay must reflect equipment opportunity cost and refrigeration fuel burn.',
  ARRAY['layover','staying the night','rescheduled tomorrow','not loading today','overnight at shipper','reefer running all night','layover pay','second day'],
  'Driver held >=24 hours past scheduled appointment without loading/unloading complete. Layover pay below: $250/day dry van, $300-400/day reefer (fuel burn), $350-500/day flatbed/step deck, $500+/day hazmat/specialized.',
  'DAT Accessorial Benchmarks 2024-2025; FreightWaves; NASTC carrier surveys; Rate Con terms',
  'At hour 20, notify broker in writing that layover will trigger at hour 24 and quote the daily rate. Document with driver photos and facility contact log. Bill per day until release.',
  'dispatch -> operations -> accounting',
  ARRAY['DET-001','DET-002','ACCESS-001','COMM-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'TONU-001',
  'Truck Ordered Not Used (TONU) compensation',
  'broker_customer_relations',
  'medium',
  'When a broker cancels a dispatched load after the truck has accepted and begun moving or staged for pickup, TONU pay is owed as either a flat kill fee or partial linehaul. Tori flags cancellations where the broker offers no TONU or below-market compensation.',
  ARRAY['load cancelled','cancelled at shipper','TONU','dry run','broker cancelled','no freight','shipper cancelled','kill fee','deadhead back'],
  'Load cancelled after dispatch accepted without TONU pay of: $150-250 dry van, $200-300 reefer, $250-400 flatbed/step deck, $300-500 hazmat, OR minimum 20-50% of linehaul if deadhead exceeds 50 miles.',
  'TIA Carrier-Broker Agreement Standard; DAT Accessorial Benchmarks; Rate Con terms',
  'Confirm cancellation in writing and quote TONU per Rate Con or industry floor. If broker refuses, document deadhead miles and escalate to operations within 4 hours.',
  'dispatch -> operations -> accounting',
  ARRAY['RATE-003','ACCESS-001','COMM-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'LUMP-001',
  'Lumper fee handling and reimbursement',
  'broker_customer_relations',
  'medium',
  'Lumper fees are paid by the shipper/consignee but frequently pushed onto drivers, who must be reimbursed dollar-for-dollar. Preferred method is broker-issued Comdata or EFS code at the receiver; driver-paid cash or personal card requires receipt and same-day reimbursement request.',
  ARRAY['lumper','lumper fee','Comdata','EFS code','need a check','driver paid lumper','$150 lumper','lumper receipt','reimbursement'],
  'Driver pays lumper out of pocket without: (a) written broker authorization before payment, (b) receipt with facility name and amount, (c) reimbursement request submitted same business day. Any lumper charged back to carrier without receiver receipt = violation.',
  '49 USC 14103 (unloading services); TIA Best Practices; Company Policy',
  'Instruct driver to request Comdata/EFS before paying cash. If driver must pay, photograph receipt immediately and submit reimbursement within 24 hours. Never accept broker chargeback without receipt.',
  'dispatch -> accounting',
  ARRAY['ACCESS-001','BRBOL-001','COMM-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'QP-001',
  'Quick pay versus standard pay terms',
  'broker_customer_relations',
  'medium',
  'Standard broker payment is net 30 days from POD receipt. Quick pay accelerates settlement to 1-7 days in exchange for a 2-5% discount on the linehaul. Tori flags brokers exceeding 30 days without notice and quick-pay offers that demand discounts above the industry ceiling.',
  ARRAY['quick pay please','QP 2%','quick pay 3%','net 30','net 45','still not paid','past due','payment delayed','invoice aged'],
  'Quick pay discount >5% = overpriced. Standard pay aging >30 days past POD without broker notice = collections trigger. Aging >45 days = credit-watch trigger per CRED-001.',
  'TIA Carrier Payment Standards; DAT industry benchmarks 2024-2025; Company AR policy',
  'Accept quick pay only at <=3% for credit-watch brokers, <=5% for new brokers. At day 31 past POD, send aging notice. At day 45, escalate to ownership and flag broker in CRED-001.',
  'accounting -> operations -> ownership',
  ARRAY['FACT-001','CRED-001','BLIST-001','POD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FACT-001',
  'Broker factoring agreement and Notice of Assignment',
  'broker_customer_relations',
  'critical',
  'If a broker has assigned receivables to a factor, carriers must remit payment to the factor upon receipt of a valid Notice of Assignment (NOA). Paying the broker after NOA receipt creates double-payment liability. A conflicting NOA or sudden unrelease notice is a top indicator of broker distress.',
  ARRAY['NOA','notice of assignment','factoring company','pay the factor','release of assignment','do not pay broker','assigned to','lockbox change','new remit address'],
  'Payment sent to broker after NOA received from a UCC-1 perfected factor. Receiving conflicting NOAs from two factors on same broker. NOA release letter not on factor letterhead. Remit address change not confirmed by factor.',
  'UCC Article 9 (Secured Transactions); 49 CFR 371; TIA Factoring Best Practices',
  'Verify every NOA against UCC-1 filing and factor contact. Update AR remit-to immediately on valid NOA. On release, require signed release letter from the factor â€” never from the broker. Freeze payment on conflicting NOAs and escalate.',
  'accounting -> ownership',
  ARRAY['QP-001','CRED-001','BLIST-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'CRED-001',
  'Broker credit check and monitoring before dispatch',
  'broker_customer_relations',
  'high',
  'No load dispatches without a current credit pull from at least one of Ansonia, RMIS, or Highway, plus a SaferWatch/Carrier411 review for complaints, authority status, and double-brokering history. Credit minimums must match payment exposure. This rule consolidates vetting across all major industry credit and blacklist services.',
  ARRAY['credit pulled','Ansonia score','RMIS','Highway score','Carrier411','SaferWatch','broker blacklisted','do not haul','credit denied','pays slow'],
  'Dispatch to broker with: Ansonia score <75 (or equivalent "pays slow" rating on RMIS/Highway), Carrier411 complaint count >3 in 12 months, SaferWatch "inactive" or "out of service" authority, or no credit file at all for loads >$2,500.',
  '49 CFR 371.3; FMCSA SAFER; Ansonia / RMIS / Highway / Carrier411 / SaferWatch platform standards',
  'Pull fresh credit within 30 days of every dispatch. Require ownership approval for loads to brokers below threshold. Add any broker with 2+ complaints to internal watchlist.',
  'dispatch -> operations -> ownership',
  ARRAY['RATE-002','BLIST-001','DBROKER-001','FACT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'BLIST-001',
  'Broker red flags and watchlist triggers',
  'broker_customer_relations',
  'critical',
  'Newly issued MC authorities (<6 months), brokers with no payment history, mismatched entity names between Rate Con and MC registration, and Gmail/Yahoo-only contact addresses are the leading precursors to non-payment and double-brokering scams. These patterns must auto-flag before dispatch.',
  ARRAY['new MC','MC issued last month','first load','no credit history','gmail broker','yahoo email','different company name','can''t find them','brand new broker'],
  'Any of: (a) MC authority granted <6 months per FMCSA SAFER; (b) no payment history in Ansonia/RMIS/Highway; (c) broker legal name on Rate Con differs from FMCSA registered name; (d) contact email is free webmail only; (e) phone number unanswered during vetting call.',
  'FMCSA SAFER; TIA Broker Vetting Standards; FreightWaves fraud advisories 2024-2025',
  'Require COD or quick pay for all loads with new-MC brokers until 90-day payment history is established. Confirm identity via outbound call to FMCSA-registered phone, not Rate Con phone.',
  'dispatch -> operations -> ownership',
  ARRAY['RATE-002','CRED-001','DBROKER-001','FACT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DBROKER-001',
  'Double-brokering detection and prevention',
  'broker_customer_relations',
  'critical',
  'Double brokering occurs when a carrier books a load and re-brokers it to another carrier without shipper or broker authorization â€” exposing cargo to theft, creating payment-chain breaks, and violating broker authority rules. Identity-spoofed carriers and mismatched pickup instructions are the leading signals.',
  ARRAY['another carrier showed up','different truck number','driver name doesn''t match','re-brokered','wrong MC at pickup','shipper said another truck','load posted again','can''t reach driver','identity spoof'],
  'Any of: (a) truck/driver at shipper differs from dispatched truck/driver; (b) load posted on DAT/Truckstop by another party after booking; (c) broker name on shipper paperwork differs from broker on Rate Con; (d) pickup number issued to different MC; (e) carrier without broker authority re-offering the load.',
  '49 USC 14916 (unlawful brokerage); 49 CFR 371.2; FMCSA fraud alerts 2024-2026',
  'Halt load, notify broker and shipper. Do not release freight. Report to FMCSA National Consumer Complaint Database and Carrier411. Freeze AR on the chain.',
  'dispatch -> operations -> ownership -> claims',
  ARRAY['RATE-002','CRED-001','BLIST-001','BRBOL-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'BRBOL-001',
  'Bill of Lading signatures and clean vs exception notation',
  'broker_customer_relations',
  'critical',
  'A valid BOL requires shipper signature at origin and consignee signature at delivery. A "clean" BOL at delivery means no notations; an "exception" BOL records damage, shortage, or refusal and is the carrier''s legal defense under Carmack. Signing clean when damage is present waives claim defenses.',
  ARRAY['no signature on BOL','shipper didn''t sign','signed clean','exception noted','short 2 pallets','damaged at delivery','receiver refused','wet boxes','count off','BOL signed'],
  'BOL missing shipper signature at pickup, consignee signature at delivery, or piece count. Driver signs clean BOL when visible damage, shortage, or temperature deviation exists. Exception not noted in writing on BOL before consignee signs.',
  '49 USC 14706 (Carmack Amendment); 49 CFR 373.101; Uniform Straight Bill of Lading',
  'Driver must obtain legible signatures and printed name at both ends. If damage/short, note specifically on BOL (e.g., "2 cases crushed, carton 47-48") before consignee signs. Photograph BOL and freight immediately.',
  'dispatch -> operations -> claims',
  ARRAY['POD-001','OSD-001','CLAIM-001','DET-003'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'POD-001',
  'Proof of Delivery submission window',
  'broker_customer_relations',
  'high',
  'POD (signed BOL, delivery receipt, lumper receipt if any) must reach accounting for invoicing within 24-48 hours of delivery. Late POD delays invoicing, pushes AR aging past 30 days, and voids quick-pay eligibility with many brokers.',
  ARRAY['POD submitted','POD uploaded','delivered empty','signed BOL attached','need POD','POD missing','where''s the POD','driver hasn''t sent','scanned delivery'],
  'POD not received by accounting within 48 hours of delivery timestamp. POD illegible, missing consignee signature, or missing printed name. Quick-pay invoice submitted without POD = reject by broker.',
  '49 CFR 373.101; TIA Invoicing Standards; Rate Con terms',
  'Require driver to upload POD within 24 hours. Auto-flag at 36 hours; call driver at 48 hours. Invoice within 1 business day of POD receipt.',
  'dispatch -> accounting',
  ARRAY['BRBOL-001','OSD-001','QP-001','TRACK-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'OSD-001',
  'Over, Short, and Damaged (OS&D) reporting protocol',
  'broker_customer_relations',
  'critical',
  'Any OS&D discovered at pickup or delivery requires immediate broker notification, photo documentation, and exception notation on the BOL before the consignee or shipper signs. Delayed reporting shifts liability to the carrier under Carmack presumption and voids most cargo policies.',
  ARRAY['OS&D','damage noted','short load','overage','pallet missing','freight damaged','broken seal','leaking','temperature deviation','wet freight'],
  'OS&D not reported to broker in writing within 1 hour of discovery. BOL signed clean despite visible damage/short. Photos not taken before trailer sealed or freight moved. Seal number discrepancy not logged.',
  '49 USC 14706 (Carmack); 49 CFR 370.3; Company Policy',
  'Driver photographs freight, BOL, seal, and trailer interior before any signature. Operations notifies broker in writing within 1 hour. Hold freight pending broker/shipper instruction. Open claim file same day.',
  'dispatch -> operations -> claims -> customer_service',
  ARRAY['BRBOL-001','CLAIM-001','DENY-001','POD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'CLAIM-001',
  'Cargo claim filing and response windows under Carmack',
  'broker_customer_relations',
  'critical',
  'Under the Carmack Amendment, shippers have 9 months from delivery to file a written cargo claim, and carriers must acknowledge receipt within 30 days and resolve (pay, decline, or make firm settlement offer) within 120 days. Missing either carrier window creates statutory exposure and bad-faith liability.',
  ARRAY['claim filed','cargo claim','claim number','9 months','received claim letter','claim acknowledged','120 days','claim response due','claim pending'],
  'Claim acknowledgment letter not sent within 30 days of written claim receipt. Claim not paid, declined, or offered settlement within 120 days of receipt. Shipper claim accepted after 9-month Carmack window closed without a waiver.',
  '49 USC 14706 (Carmack Amendment); 49 CFR 370.5, 370.9 (processing claims)',
  'Log every claim into the claims register on day of receipt. Send written acknowledgment within 15 days (buffer). Complete investigation by day 90 to allow 30-day decision buffer. Never ignore a claim letter.',
  'claims -> ownership',
  ARRAY['BRBOL-001','OSD-001','DENY-001','POD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DENY-001',
  'Cargo claim denial grounds and appeal protocol',
  'broker_customer_relations',
  'high',
  'Carmack recognizes five defenses that allow claim denial: act of God, act of public enemy, act of shipper (including improper packaging), act of public authority, and inherent vice of the goods. Driver error generally does not qualify. Denials must cite the specific defense in writing, and carriers must accept written appeals with new evidence within a reasonable window.',
  ARRAY['claim denied','denial letter','act of God','inherent vice','improper packaging','shipper loaded','driver error','appeal the claim','new evidence','reconsideration'],
  'Denial issued without citing a recognized Carmack defense. Denial based solely on "driver error" without contributory negligence finding. Appeal received with new evidence and ignored beyond 30 days. Denial letter lacking claim number, date, and factual basis.',
  '49 USC 14706; 49 CFR 370.9; Missouri Pacific R.R. v. Elmore & Stahl standard',
  'Denial letters must cite statute, defense category, and evidence (BOL, photos, driver log). Log every appeal and assign for review within 5 business days. Treat Shipper Load & Count (SLC) BOLs as top appeal defense.',
  'claims -> operations -> ownership',
  ARRAY['CLAIM-001','BRBOL-001','OSD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'XBORDER-001',
  'Cross-border documentation for US-Canada and US-Mexico',
  'broker_customer_relations',
  'critical',
  'Northbound Canada loads require PARS (Pre-Arrival Review System) barcode and ACE eManifest filed >=1 hour before border arrival; southbound US loads from Canada require PAPS. Mexico loads require bilingual/translated BOL, Carta Porte, and ACE eManifest for US-entering freight. Missing documentation forces border turnaround and detention charges against the carrier.',
  ARRAY['PARS','PAPS','ACE manifest','eManifest','border crossing','Laredo','Otay Mesa','Carta Porte','customs broker','bilingual BOL','at the bridge'],
  'ACE eManifest not filed >=1 hour before US arrival. PARS/PAPS barcode missing or unmatched. Southbound Mexico BOL not translated/bilingual. Carta Porte missing for Mexico domestic leg. Customs broker not assigned before dispatch.',
  '19 CFR 123 (CBP); CBP ACE Manifest requirements; CBSA eManifest; SAT Carta Porte (Mexico)',
  'Confirm ACE/ACI filing >=2 hours before border. Verify PARS/PAPS label on BOL at pickup. For Mexico, require customs broker contact and bilingual BOL before dispatch. Hold load if any document missing.',
  'dispatch -> operations -> customer_service',
  ARRAY['CTPAT-001','BRBOL-001','COMM-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'CTPAT-001',
  'C-TPAT compliance for cross-border freight',
  'broker_customer_relations',
  'high',
  'C-TPAT (Customs Trade Partnership Against Terrorism) loads require verified driver ID, high-security ISO 17712 seals, seven-point trailer inspection, and an uninterrupted chain of custody. Seal breaks, unauthorized stops, or missing inspections disqualify the load from C-TPAT FAST lanes and trigger secondary inspection.',
  ARRAY['C-TPAT','CTPAT','ISO 17712','high security seal','seal broken','FAST lane','seven point inspection','seal number','chain of custody','driver vetted'],
  'Seal not ISO 17712 high-security rated. Seven-point inspection not documented at origin. Seal number on BOL differs from physical seal at delivery. Unauthorized stop between origin and border. Driver not on C-TPAT approved roster when required.',
  'CBP C-TPAT Minimum Security Criteria; ISO/PAS 17712; 19 CFR 149',
  'Verify seal number matches BOL at every handoff. Photograph seal at pickup and border. Do not break seal without CBP or shipper authorization. Log seven-point inspection in load file.',
  'dispatch -> operations -> customer_service',
  ARRAY['XBORDER-001','BRBOL-001','OSD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'BRSCORE-001',
  'Customer scorecard performance thresholds',
  'broker_customer_relations',
  'high',
  'Shippers and large brokers scorecard carriers on on-time pickup, on-time delivery, tracking compliance, and claim rate. Falling below thresholds triggers lane loss, tender-share reduction, or probation. Tori monitors rolling 30/60/90-day performance and alerts before a scorecard drop becomes a business loss.',
  ARRAY['scorecard','on-time percentage','OTIF','tracking compliance','service failure','put on probation','lane pulled','quarterly review','carrier scorecard','KPI'],
  'Rolling 90-day: on-time pickup <95%, on-time delivery <95%, tracking compliance <98%, claim rate >0.5% of loads, or tender acceptance <90%. Any single service failure on a Top-10 customer = immediate flag.',
  'Customer Contract (shipper/broker MSA); TIA Carrier Performance Standards; industry benchmark (Gartner/CSCMP)',
  'Refresh scorecard weekly. On any metric breach, notify operations and assigned account manager same day. Build corrective action plan before the customer raises it.',
  'operations -> customer_service -> ownership',
  ARRAY['TRACK-001','POD-001','CLAIM-001','COMM-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'TRACK-001',
  'Consolidated tracking compliance across MacroPoint, Project44, and FourKites',
  'broker_customer_relations',
  'high',
  'Major shippers and brokers require continuous GPS visibility via MacroPoint (Descartes), Project44, or FourKites from dispatch acceptance through delivery signature. Tracking drops, denied location permissions, or unlinked driver phones are contractual violations that count against the scorecard and can forfeit the load rate.',
  ARRAY['MacroPoint requested','Project44','FourKites','P44 link','tracking not working','location denied','driver won''t share','ping failed','tracking lost','opt-in tracking','connect tracking'],
  'Tracking not connected within 30 minutes of Rate Con signing. Ping loss >2 hours during active dispatch. Driver declines location permission. Device battery drop without failover. Tracking not maintained through delivery signature. Any single failure on Top-10 customer lane = violation.',
  'MacroPoint/Descartes Carrier Terms; Project44 Carrier Standards; FourKites Connect Standards; Customer Contract',
  'Confirm driver opt-in within 30 minutes of dispatch. Monitor ping gaps; call driver at 60-minute drop. Never accept a load without platform confirmed if required. Maintain a tracking exception log for scorecard defense.',
  'dispatch -> operations -> customer_service',
  ARRAY['BRSCORE-001','COMM-001','POD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'ACCESS-001',
  'Accessorial charge schedule and billing integrity',
  'broker_customer_relations',
  'medium',
  'Every Rate Con must carry a complete accessorial schedule: driver assist, inside delivery, detention, layover, lumper, stop-off, tarps (flatbed), and reefer fuel surcharge. Missing or under-priced accessorials cause revenue leakage and settlement disputes. Tori flags missing schedules before signing and under-billed settlements after POD.',
  ARRAY['driver assist','inside delivery','stop off','tarp fee','lumper','detention','layover','accessorial schedule','missing charge','not on ratecon'],
  'Rate Con missing explicit rates for any of: driver assist ($75-150), inside delivery ($150-300), stop-off ($50-100 each), tarp ($50-100 flatbed), reefer fuel surcharge, detention (per DET-002), layover (per LAY-001), lumper reimbursement terms. Settlement missing any earned accessorial.',
  'DAT Accessorial Benchmarks 2024-2025; TIA Carrier Standards; Rate Con terms',
  'Do not sign Rate Con without complete accessorial schedule. On settlement, reconcile every earned accessorial; dispute missing lines within 5 business days of settlement receipt.',
  'dispatch -> accounting -> operations',
  ARRAY['RATE-001','DET-002','LAY-001','LUMP-001','TONU-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'COMM-001',
  'Dispatch-to-broker communication standards',
  'broker_customer_relations',
  'medium',
  'Every material event â€” dispatch acceptance, pickup arrival/departure, detention/layover trigger, OS&D, ETA changes >30 minutes, and delivery â€” must be communicated in writing (email or platform message) with load number, timestamps, and supporting photos. Verbal-only updates create evidence gaps that lose detention claims, scorecard appeals, and cargo disputes.',
  ARRAY['ETA update','running late','arrived shipper','arrived receiver','delivered empty','check call','email broker','in writing','per our call','confirming','broker update'],
  'Any of: ETA slip >30 minutes without written notice; arrival/departure not confirmed in writing with timestamp; detention/layover start not communicated in writing within 15 minutes of trigger; OS&D communicated verbally only; response to broker inquiry delayed >2 hours during business hours.',
  'TIA Carrier Communication Best Practices; Rate Con terms; Company Policy',
  'Every status change goes in writing with load number and timestamp. Use Telegram dispatch thread as record, then mirror to broker email. Photograph every material event. Respond to broker messages within 2 business hours.',
  'dispatch -> operations -> customer_service',
  ARRAY['DET-003','LAY-001','OSD-001','TRACK-001','BRSCORE-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- ============================================================
-- Domain 6: Driver Employment & HR (26 Rules)
-- ============================================================

-- DQ-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DQ-001',
  'Driver Qualification File Completeness Per 49 CFR 391.51(b)',
  'driver_employment_hr',
  'critical',
  'Every driver hired to operate a CMV must have a complete DQ file within 30 days of the first day of safety-sensitive work. Missing any of the nine required components (application, prior employer inquiry, MVR, road test/equivalent, annual MVR, annual review note, list of violations, medical certificate, National Registry verification) exposes the carrier to FMCSA civil penalties and puts the driver out-of-service on audit.',
  ARRAY['DQ file missing','incomplete DQ','no application on file','missing med card','no road test','road test certificate','prior employer','previous employer inquiry','391.21','PSP report not pulled','MVR not on file','new hire paperwork incomplete'],
  'DQ file is missing any item required under 49 CFR 391.51(b)(1)-(9) more than 30 days after driver''s first day of employment, OR driver operated a CMV before DQ file was complete.',
  '49 CFR 391.21, 391.23, 391.25, 391.27, 391.31, 391.43, 391.51',
  'Flag driver name, pull DQ file within 24 hours, identify missing components, and suspend driver from safety-sensitive work until file is complete. Create remediation checklist with 7-day deadline.',
  'Safety -> HR -> Operations; escalate to ownership if driver has been running incomplete >7 days',
  ARRAY['DQ-002','MVR-001','SCREEN-001','TEST-001','REVIEW-001','RETAIN-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- DQ-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DQ-002',
  'DQ File Retention 3 Years After Termination',
  'driver_employment_hr',
  'high',
  'The complete DQ file must be retained for the duration of employment plus three years after the driver separates. Certain items (annual MVR, annual review note, medical certificate, National Registry verification) may be purged three years after execution while the driver remains employed. Premature destruction creates FMCSA audit findings and undermines defense in accident litigation.',
  ARRAY['purge DQ file','destroy driver file','shredding','old driver records','terminated driver file','3 year retention','file room cleanup','archive driver','DQ expired'],
  'Any DQ file destroyed, archived inaccessibly, or missing for a driver who separated less than 36 months ago, OR wholesale purging of DQ files outside the 391.51(d) allowed items during active employment.',
  '49 CFR 391.51(c), 391.51(d)',
  'Freeze all scheduled purging until reviewed by HR. Verify separation date for each file and retain any file from driver separated within 36 months. Document retention schedule in writing.',
  'HR -> Safety -> Ownership',
  ARRAY['DQ-001','RETAIN-001','TERM-001','EXIT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- MVR-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'MVR-001',
  'Annual MVR Inquiry and Review Per 49 CFR 391.25',
  'driver_employment_hr',
  'high',
  'At least once every 12 months the carrier must obtain an MVR from every state where the driver held a license or permit in the preceding 12 months and a qualified reviewer must sign a dated review note determining continued qualification under 49 CFR 391.15. A lapse longer than 365 days is a recordable violation and disqualifies the driver from CMV operation until cured.',
  ARRAY['MVR expired','annual review overdue','pull MVR','MVR due','driving record','review note missing','last MVR date','391.25'],
  'More than 365 days between MVR review dates for any active driver, OR MVR obtained but signed review note absent from DQ file, OR MVR pulled from only one state when driver held license in multiple states during review period.',
  '49 CFR 391.25(a), 391.25(b), 391.25(c)(2)',
  'Pull current MVRs from all applicable states within 48 hours, complete signed review note, and suspend driver if disqualifying conviction surfaces until §391.15 analysis is complete.',
  'Safety -> HR; if disqualifying conviction found, immediate escalation to Operations and Ownership',
  ARRAY['DQ-001','REVIEW-001','CONV-001','CONV-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- CONV-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'CONV-001',
  'Major Offense Disqualification Per 49 CFR 383.51 Table 1',
  'driver_employment_hr',
  'critical',
  'A first conviction for DUI/DWI, alcohol concentration >=0.04 while operating a CMV, controlled-substance impairment, refusing a DOT test, leaving the scene of an accident, using a CMV in a felony, driving while CDL suspended, or causing a fatality through negligent CMV operation results in a minimum 1-year disqualification (3 years if in a HazMat CMV). A second conviction for any Table 1 offense triggers lifetime disqualification. Felony use of any vehicle to manufacture or distribute controlled substances is immediate lifetime disqualification with no 10-year reinstatement.',
  ARRAY['DUI','DWI','refused test','refused drug test','left the scene','hit and run','felony','suspended CDL','fatal accident','driver arrested','0.04 BAC','drug charge','disqualified'],
  'Driver operates a CMV after any Table 1 conviction became reportable, OR carrier fails to disqualify driver within required period after learning of conviction, OR second lifetime-qualifying conviction not acted upon.',
  '49 CFR 383.51(b) Table 1; 49 CFR 391.15',
  'Remove driver from safety-sensitive duty immediately, confirm conviction via MVR/PSP, notify insurance and safety within 24 hours, and document disqualification in writing with effective date.',
  'Safety -> HR -> Legal -> Ownership',
  ARRAY['MVR-001','CONV-002','SCREEN-001','TERM-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- CONV-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'CONV-002',
  'Serious Traffic Violation Disqualification 60/120 Days',
  'driver_employment_hr',
  'high',
  'Two serious traffic violations in a 3-year rolling window trigger a 60-day disqualification; three or more within 3 years triggers 120 days. Serious violations include speeding 15 mph or more over the limit, reckless driving, improper or erratic lane changes, following too close, driving CMV without proper CDL/endorsement, texting while driving a CMV, and handheld mobile phone use while driving a CMV.',
  ARRAY['speeding ticket','reckless','lane change violation','following too close','texting while driving','handheld phone','second violation','third violation','60 day','120 day'],
  'Any CDL driver accrues 2 qualifying Table 2 convictions within any 3-year window without a 60-day disqualification applied, OR 3 within 3 years without 120-day disqualification applied.',
  '49 CFR 383.51(c) Table 2',
  'Pull 3-year MVR history, count convictions by date, apply correct disqualification period, and pull driver from CMV duty for the entire period. Document counseling for single-conviction drivers.',
  'Safety -> HR -> Operations',
  ARRAY['MVR-001','CONV-001','REVIEW-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- EXP-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'EXP-001',
  'Minimum Driving Experience Verification at Hire',
  'driver_employment_hr',
  'medium',
  'Carrier policy sets minimum CDL-A experience for new hires (commonly 6 months, 1 year, or 2 years depending on equipment and insurance requirements). The 10-year CMV employment history on the 391.21 application must be corroborated by the 3-year 391.23 safety performance history inquiry before the driver is hired.',
  ARRAY['no experience','6 months experience','1 year CDL','green driver','recent graduate','first job','insurance minimum','experience waiver'],
  'Driver hired below the written policy minimum without documented ownership-level exception, OR 10-year CMV employment history on application has unexplained gaps greater than 30 days, OR 391.23 prior-employer inquiry not completed before unsupervised dispatch.',
  '49 CFR 391.21, 391.23; Company Policy; Insurance Underwriting',
  'Verify each prior carrier listed via 391.23 inquiry, document response or non-response, and flag any gap over 30 days for written explanation signed by the driver.',
  'HR -> Safety -> Insurance contact if exception needed',
  ARRAY['DQ-001','SCREEN-001','NEWHIRE-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- PAY-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'PAY-001',
  'CPM Pay Rate Within Market Benchmark',
  'driver_employment_hr',
  'medium',
  'Company driver CPM typically ranges 50-75 cents/mile and owner-operator line-haul averages roughly $1.38/mile plus fuel surcharge per ATRI 2025 operational-costs data. Offers materially below market drive turnover and trigger re-hire costs; offers materially above market without written approval compress margin. Rates should be documented in a signed pay agreement before first dispatch.',
  ARRAY['cpm','cents per mile','pay rate','rate agreement','pay offer','below market','raise request','pay bump','45 cents','60 cents','70 cents'],
  'Company-driver CPM less than $0.45 or greater than $0.80 without written operations sign-off, OR owner-operator line-haul below $1.25 without written justification, OR no signed pay agreement on file before first dispatched load.',
  'Company Policy; ATRI 2025 Operational Costs of Trucking; FLSA minimum wage floor (29 USC 206)',
  'Cross-check offered CPM against current benchmark, require operations approval for out-of-band rates, and confirm signed pay agreement is uploaded to the driver file.',
  'HR -> Operations -> Ownership for out-of-band rates',
  ARRAY['PAY-002','PAY-003','WAGE-001','BONUS-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- PAY-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'PAY-002',
  'Driver Pay Dispute Resolution SLA',
  'driver_employment_hr',
  'high',
  'Every pay dispute — short miles, missing detention, unauthorized deduction, stop pay, or layover pay — must receive a written response within two business days and a resolution within seven days. Unresolved disputes escalate turnover and, when involving unauthorized deductions, can trigger state wage-claim liability and FLSA backpay exposure.',
  ARRAY['pay short','haven''t been paid','shorted me','missing detention','missing stop pay','didn''t get paid','deduction','paycheck wrong','where''s my pay','settlement wrong','escrow deduction'],
  'Driver complaint about pay not acknowledged in writing within 48 hours, OR not resolved within 7 calendar days, OR resolved with a deduction not authorized in writing by the driver.',
  'FLSA 29 USC 206-207; state wage-payment laws; Company Policy',
  'Open a pay-dispute ticket, acknowledge within 48 hours, recalculate using load paperwork and detention proofs, respond in writing, and correct next settlement if owed.',
  'Accounting/Payroll -> HR -> Operations; Legal if unauthorized deduction or wage-claim threatened',
  ARRAY['PAY-001','PAY-003','ESCROW-001','WAGE-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- PAY-003
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'PAY-003',
  'IRS Transportation Per Diem Rate Accuracy',
  'driver_employment_hr',
  'medium',
  'The special M&IE per diem for DOT-hours-of-service transportation workers is $80/day CONUS and $86/day OCONUS for October 1, 2025 through September 30, 2026 (IRS Notice 2025-54), with 80% deductibility under IRC §274(n)(3). Using an outdated rate creates payroll and tax-reporting errors and driver W-2 complaints.',
  ARRAY['per diem','69 per day','80 per day','per diem rate','meal allowance','M&IE','tax deduction','1099 per diem','W-2 per diem'],
  'Payroll pays per diem above IRS rate without substantiation, OR uses a stale rate ($69/day on travel after 10/1/2024), OR applies 50% deductibility instead of 80% for DOT HOS-covered drivers.',
  'IRS Notice 2025-54; IRS Publication 463; Rev. Proc. 2019-48; IRC §274(n)(3)',
  'Update payroll tables to $80/$86 per diem, document the Notice citation, and apply transition rules for travel that straddles October 1 rate changes.',
  'Accounting/Payroll -> HR -> CFO/Ownership',
  ARRAY['PAY-001','PAY-002','NEWHIRE-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- ESCROW-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'ESCROW-001',
  'Owner-Operator Escrow Compliance Per 49 CFR 376.12(k)',
  'driver_employment_hr',
  'high',
  'A compliant owner-operator lease must specify the escrow amount, permissible deductions, accounting method, quarterly interest at or above the 91-day T-bill average yield, and unconditional return within 45 days of lease termination. Holding escrow past 45 days or applying it to items not listed in the lease is a federal violation and routinely litigated by OOIDA.',
  ARRAY['escrow','security deposit','owner operator escrow','escrow return','45 days','held my escrow','deducted from escrow','final settlement','lease terminated'],
  'Escrow not returned within 45 days of lease termination, OR deduction applied to a line item not specified in the lease, OR no quarterly interest paid, OR no final accounting issued at return.',
  '49 CFR 376.12(k)(1)-(6)',
  'Trigger escrow close-out workflow on termination date, calculate interest through return date, apply only lease-authorized deductions, and release funds with final accounting within 45 days.',
  'Accounting -> HR -> Legal if past 40 days unresolved',
  ARRAY['LEASE-001','PAY-002','EXIT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- LEASE-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'LEASE-001',
  'Owner-Operator Lease Compliance Per 49 CFR 376',
  'driver_employment_hr',
  'high',
  'Every owner-operator lease must be in writing, signed, specify exclusive possession of the equipment by the carrier, list compensation, and disclose all chargebacks with supporting documentation available on request. Failure to comply exposes the carrier to double-damages suits and FMCSA enforcement distinct from employee misclassification risk.',
  ARRAY['lease agreement','owner operator','chargeback','fuel deduction','settlement statement','truth in leasing','lease on','leased driver','376.12'],
  'Active owner-operator running without a fully executed lease meeting all 49 CFR 376.12 elements, OR chargeback imposed without documentation available on demand, OR lease does not specify exclusive possession or compensation method.',
  '49 CFR 376.11, 376.12(a)-(l)',
  'Audit all active O-O leases for 12-element compliance; suspend dispatch for any O-O without compliant lease within 7 days; prepare remediated lease for signature.',
  'HR -> Operations -> Legal',
  ARRAY['ESCROW-001','IC-001','PAY-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- IC-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'IC-001',
  'IC vs W-2 Classification State & Federal Test Compliance',
  'driver_employment_hr',
  'critical',
  'Worker classification is tested under federal and state law. The DOL 2024 six-factor economic reality rule (29 CFR Part 795) remains in effect for private litigation as of April 2026 although a rescission NPRM is pending. California (AB5/Dynamex), New Jersey (Hargrove), Massachusetts (§148B), and Illinois apply the stricter ABC test, whose B-prong makes traditional owner-operator models largely untenable in those states. Misclassification exposes the carrier to back-wages, overtime, payroll taxes, unemployment, workers'' comp, and personal liability for officers in MA.',
  ARRAY['1099 driver','independent contractor','AB5','ABC test','misclassification','should be W-2','treated like employee','California driver','New Jersey driver','Massachusetts driver','Illinois driver','reclassified'],
  'Any 1099 driver domiciled or regularly dispatched in CA, NJ, MA, or IL without documented business-to-business exemption and ABC-test analysis, OR failure of any DOL 6-factor element under economic-reality totality, OR W-2 duties performed under 1099 paperwork (directed routes, exclusive service, company-controlled equipment).',
  '29 CFR Part 795 (DOL 2024 Rule); Cal. Lab. Code §§2775-2787; Dynamex Operations West v. Superior Court, 4 Cal. 5th 903 (2018); CTA v. Bonta, 996 F.3d 644 (9th Cir. 2021); N.J.S.A. 43:21-19(i)(6); Hargrove v. Sleepy''s, 220 N.J. 289 (2015); M.G.L. c. 149 §148B; 820 ILCS 185',
  'Flag every 1099 driver with CA/NJ/MA/IL nexus for legal review within 7 days, document B2B exemption checklist, and require quarterly classification audit signed by HR and counsel.',
  'HR -> Legal -> Ownership; immediate Legal involvement for CA drivers',
  ARRAY['LEASE-001','WAGE-001','PAY-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- WAGE-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'WAGE-001',
  'FLSA Motor Carrier Act Exemption and Small Vehicle Exception',
  'driver_employment_hr',
  'high',
  'The Motor Carrier Act exemption at 29 USC 213(b)(1) removes overtime — not minimum wage — for drivers, driver-helpers, loaders, and mechanics whose duties affect CMV safety in interstate commerce. The SAFETEA-LU 2008 small-vehicle exception restores overtime for any workweek in which the employee operated a vehicle with GVWR of 10,000 pounds or less (excluding passenger vehicles and placarded hazmat). Misapplying the exemption to mixed fleets is a common source of FLSA collective actions.',
  ARRAY['overtime','time and a half','box truck','sprinter','cargo van','10000 lbs','GVWR','non-exempt','40 hours','FLSA claim','wage claim'],
  'Driver operated a <=10,000 lb GVWR vehicle in any week but was not paid overtime at 1.5x for hours over 40, OR intrastate-only driver classified as MCA-exempt, OR pay rate below federal or applicable state minimum wage after all hours counted.',
  '29 USC 213(b)(1); 29 CFR Part 782; SAFETEA-LU Technical Corrections Act of 2008 §306; DOL Fact Sheet #19',
  'Audit fleet by GVWR class each week, pay overtime for any week with <=10,000 lb operation, and document interstate commerce nexus for every driver claimed as exempt.',
  'Payroll -> HR -> Legal',
  ARRAY['WAGE-002','IC-001','PAY-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- WAGE-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'WAGE-002',
  'Detention and Waiting Time Hours-Worked Classification',
  'driver_employment_hr',
  'medium',
  'Detention and on-duty waiting time are compensable hours worked under the FLSA when the driver is unable to use the time effectively for personal purposes. For non-exempt drivers this time counts toward overtime; for MCA-exempt drivers it still counts toward minimum-wage compliance. Separately, 49 CFR 382.107 defines these periods as safety-sensitive functions for drug-and-alcohol-testing purposes.',
  ARRAY['detention','waiting','shipper delay','stuck at dock','layover','on duty not driving','waited hours','no pay for waiting','sitting'],
  'Driver paid zero for detention hours where unable to use time effectively, OR average hourly earnings fall below minimum wage when waiting time is included, OR detention pay inconsistent with signed pay agreement (e.g., policy $25/hour after 2 hours but settlement pays only after 3).',
  '29 USC 206; 29 CFR 785.14-785.17; 49 CFR 382.107; DOL Fact Sheet #22',
  'Reconcile detention claimed against ELD on-duty time, apply the policy rate correctly, and document any denied detention with written reason.',
  'Payroll -> HR -> Operations',
  ARRAY['WAGE-001','PAY-002','TEST-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- HARASS-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'HARASS-001',
  'ELD Harassment and Coercion Prohibited',
  'driver_employment_hr',
  'high',
  'A carrier may not use ELD data to harass a driver into violating §392.3 (ill/fatigued) or Part 395 (HOS), and neither carriers, shippers, nor intermediaries may coerce a driver to violate federal safety regulations. Violations carry civil penalties inflation-adjusted to approximately $19,933 per occurrence and give the driver a 90-day complaint window under §386.12(b).',
  ARRAY['drive through break','keep driving','ignore HOS','you have hours','push you','forced dispatch','harassment','coercion','retaliation','sick but dispatched','threatened'],
  'Dispatch instruction to drive when driver reports illness or fatigue, OR use of ELD visibility to schedule loads that require HOS violation to complete on time, OR threatened adverse action (termination, loss of loads, docked pay) tied to refusal to violate HOS/392.3/HazMat/Parts 380-383.',
  '49 CFR 390.36; 49 CFR 390.6; 49 USC 521(b)(2)(A); 49 CFR 386.12(b)',
  'Preserve Telegram/dispatch chat evidence, interview driver within 24 hours, suspend the offending dispatcher pending investigation, and notify safety to prevent recurrence. Advise driver of 90-day complaint right.',
  'Safety -> HR -> Legal -> Ownership',
  ARRAY['TERM-001','WAGE-002','TEST-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- TERM-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'TERM-001',
  'Termination Documentation and Reason Memorialization',
  'driver_employment_hr',
  'high',
  'Every driver separation — voluntary or involuntary — must be documented with a signed written notice stating effective date, stated reason, rehire eligibility, and equipment-return status. The DAC/HireRight report the carrier will later submit must match this record; inconsistent coding drives FCRA disputes and wrongful-termination claims.',
  ARRAY['terminated','fired','let go','quit','walked off','abandoned truck','voluntary quit','involuntary','reason for termination','no rehire','final day','effective immediately'],
  'Driver separated without a written termination record in the file within 5 business days, OR reason on file does not match reason reported to DAC/HireRight, OR rehire-eligibility field left blank, OR equipment-return checklist not completed.',
  '15 USC 1681e(b) (FCRA accuracy); 49 CFR 391.51(c) (retention); Company Policy',
  'Generate termination packet within 24 hours of decision, obtain supervisor signature, run equipment checklist, and queue DAC/HireRight update that matches the written record.',
  'HR -> Safety -> Operations; Legal if retaliation, protected-activity, or USERRA concern',
  ARRAY['DAC-001','EXIT-001','DQ-002','USERRA-001','HARASS-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- DAC-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DAC-001',
  'DAC/HireRight Reporting Accuracy and FCRA Process',
  'driver_employment_hr',
  'high',
  'Employment data reported to HireRight (DAC) must be accurate, and carriers using DAC reports for hiring must follow FCRA pre-adverse and adverse action procedures. The regulated-trucking exception allows a single combined adverse-action notice within 3 business days when the applicant is not physically present, but the report content itself must still be accurate and disputable within 30 days.',
  ARRAY['DAC report','DAC hit','HireRight','eligible for rehire','dispute DAC','background report','FCRA','adverse action','pre-adverse','report wrong','inaccurate'],
  'DAC/HireRight entry does not match the written termination record, OR carrier takes adverse hiring action without required FCRA notice, OR driver dispute not responded to by the CRA within 30 days with carrier cooperation, OR disclosure form is not standalone (contains liability waivers).',
  '15 USC 1681b(b)(2), 1681b(b)(3), 1681i(a)(1)(A), 1681m(a); FCRA Regulated Trucking Exception',
  'Audit DAC submissions quarterly against termination files, correct inaccuracies within 5 days of notice, and use standalone disclosure plus adverse-action notice templates reviewed by legal.',
  'HR -> Legal; ownership if class-action exposure threatened',
  ARRAY['TERM-001','SCREEN-001','NEWHIRE-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- USERRA-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'USERRA-001',
  'USERRA Reemployment and Escalator Protection',
  'driver_employment_hr',
  'high',
  'Drivers who leave for uniformed service are entitled to reemployment with seniority, pay, and status as if continuously employed, subject to a 5-year cumulative service cap with exceptions. Application windows are next workday for service of 1-30 days, 14 days for 31-180 days, and 90 days for 181+ days. Health coverage may be continued up to 24 months at no more than 102% of the full premium.',
  ARRAY['military leave','deployed','USERRA','national guard','reservist','returning from service','reemployment','drill','annual training','guard weekend'],
  'Reemployment refused or delayed when driver applied within statutory window and cumulative service remains <=5 years, OR driver returned below escalator (seniority/pay/status), OR health continuation refused or overpriced above 102%.',
  '38 USC 4301-4335; 20 CFR Part 1002; USERRA §4312, §4313, §4317',
  'On notice of service, open a USERRA file, document service dates, preserve benefits eligibility, and plan escalator reinstatement. On return, re-onboard at correct seniority and pay tier within 5 business days.',
  'HR -> Legal -> Ownership',
  ARRAY['LEAVE-001','TERM-001','NEWHIRE-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- RETAIN-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'RETAIN-001',
  'Driver Record Retention Schedule',
  'driver_employment_hr',
  'high',
  'DQ files must be retained for the duration of employment plus 3 years post-separation (49 CFR 391.51). Drug-and-alcohol records follow 49 CFR 382.401 (negatives 1 year, positives/refusals/SAP 5 years, annual MIS summaries 5 years). HOS/ELD records are retained 6 months per 49 CFR 395.8(k). A unified retention matrix prevents premature destruction and audit findings.',
  ARRAY['retention schedule','how long to keep','purge','shredding','archive','5 year','6 months','382.401','395.8','records destruction'],
  'Any record destroyed before its minimum retention period, OR no written retention schedule maintained, OR drug-and-alcohol positives/refusals aged less than 5 years and not retrievable within 2 business days.',
  '49 CFR 391.51(c)(d); 49 CFR 382.401; 49 CFR 395.8(k)',
  'Publish a single retention matrix to all record owners, tag each record with earliest destruction date, and freeze purging on any driver under active investigation or litigation hold.',
  'HR -> Safety -> Legal',
  ARRAY['DQ-002','TERM-001','EXIT-001','TEST-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- SCREEN-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'SCREEN-001',
  'Pre-Employment PSP, Clearinghouse, MVR, and DOT Test',
  'driver_employment_hr',
  'critical',
  'Before any applicant performs a safety-sensitive function, the carrier must complete an FMCSA Drug & Alcohol Clearinghouse full query with electronic driver consent, pull MVRs from every state where the driver held a license in the last 3 years, obtain a negative DOT pre-employment drug test, and (best practice) run the PSP report covering 5 years of crash data and 3 years of roadside inspections.',
  ARRAY['Clearinghouse','pre-employment query','full query','PSP','pre-employment screening','drug test not back','MVR pending','driver applied','running tomorrow','dispatch Monday'],
  'Driver dispatched before Clearinghouse full query completed with consent, OR before negative pre-employment DOT drug result, OR MVR missing from any state where driver held CDL/CLP in past 3 years, OR PSP disclosure/authorization not documented.',
  '49 CFR 382.701; 49 CFR 391.23; 49 USC 31150 (PSP); 49 CFR 40.25',
  'Block dispatch in the TMS until all four items are checked off. Document the driver-consent timestamp and MRO verification for every new hire.',
  'Safety -> HR -> Operations; any override requires Ownership sign-off',
  ARRAY['DQ-001','NEWHIRE-001','TEST-001','EXP-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- TEST-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'TEST-001',
  'Safety-Sensitive Function Scope Per 49 CFR 382.107',
  'driver_employment_hr',
  'high',
  '"Safety-sensitive function" includes waiting to be dispatched, pre- and post-trip inspection, driving, time in/on the CMV other than in a compliant sleeper berth, loading/unloading supervision, and attending a disabled vehicle. Any time a driver performs, is ready to perform, or is immediately available to perform these functions he or she is subject to the drug-and-alcohol testing program and Clearinghouse reporting.',
  ARRAY['safety sensitive','drug test','random test','post accident','return to duty','SAP','positive test','refusal','reasonable suspicion','382.107','not on duty'],
  'Driver in a safety-sensitive function not included in the random-testing pool, OR post-accident test not administered when 49 CFR 382.303 thresholds met, OR reasonable-suspicion observation by trained supervisor not documented within 24 hours.',
  '49 CFR 382.107; 49 CFR 382.301, 382.303, 382.305, 382.307; 49 CFR 40',
  'Verify every driver appears in the random pool monthly, ensure supervisor reasonable-suspicion training is current, and document any post-accident test decision with thresholds referenced.',
  'Safety -> HR -> DER (Designated Employer Representative)',
  ARRAY['SCREEN-001','CONV-001','HARASS-001','RETAIN-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- REVIEW-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'REVIEW-001',
  'Annual Driver Review and Performance Documentation',
  'driver_employment_hr',
  'medium',
  'Each active driver must have a signed annual review note in the DQ file applying §391.15 disqualification standards to the current MVR and accident record. Carriers should pair this regulatory review with an internal performance review covering HOS violations, service failures, CSA events, and pay-rate eligibility to ensure corrective action is documented.',
  ARRAY['annual review','driver review','performance review','year end review','391.25 note','review due','overdue review'],
  'DQ file lacks a dated, signed annual review note within the past 365 days, OR review note does not reference the specific MVR under review, OR reviewer is not authorized/qualified per policy.',
  '49 CFR 391.25(b)(c); 49 CFR 391.15',
  'Generate review queue 30 days before each anniversary, require reviewer to attach MVR, and store signed note in DQ file before the 365-day deadline.',
  'Safety -> HR; ownership review if pattern of overdue reviews',
  ARRAY['MVR-001','DQ-001','CONV-001','CONV-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- BONUS-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'BONUS-001',
  'Sign-On and Referral Bonus Agreement Enforceability',
  'driver_employment_hr',
  'medium',
  'Sign-on bonuses typically pay $2,500-$10,000 for solo drivers (up to $16,000 team) and are paid in milestones with a retention clawback of 6-24 months. Referral bonuses typically pay $500-$3,000, split across 30/60/90-day milestones. California AB 692 (effective January 1, 2026) imposes strict limits on "stay-or-pay" clauses — separate agreement, 5-business-day attorney review, maximum 2-year retention, no interest, prorated repayment, $5,000 minimum penalty per employee for violation.',
  ARRAY['sign on bonus','signing bonus','clawback','pay back bonus','retention bonus','referral bonus','referred driver','bonus agreement','stay or pay','AB 692'],
  'Sign-on bonus paid without signed agreement including milestones and clawback, OR clawback exceeds 24 months (2 years in CA), OR CA hire without separate AB 692-compliant agreement and 5-business-day review window, OR referral bonus not documented in written program terms.',
  'Company Policy; Cal. Bus. & Prof. Code §16608; Cal. Lab. Code §926 (AB 692); NLRB GC Memo 25-01',
  'Require signed bonus agreement on file before first payment, use CA-specific template for CA drivers, and calendar milestone payments with automated triggers.',
  'HR -> Accounting -> Legal for CA or out-of-policy terms',
  ARRAY['PAY-001','NEWHIRE-001','TERM-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- NEWHIRE-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'NEWHIRE-001',
  'New Hire Paperwork Completion Before Dispatch',
  'driver_employment_hr',
  'high',
  'Before the first dispatch, the driver file must contain W-4, I-9 with acceptable documents, direct-deposit authorization, FCRA standalone disclosure, Clearinghouse consent, PSP authorization, drug-and-alcohol consent, MVR release, §391.21 application, §391.23 prior-employer inquiry trigger, ELDT verification (post-2/7/2022), and benefits-enrollment acknowledgment. Benefits eligibility typically applies at 30-90 days; ACA prohibits waits beyond 90 days.',
  ARRAY['new hire','onboarding','paperwork','W-4','I-9','direct deposit','benefits enrollment','first day','orientation','missing forms','not completed'],
  'Driver dispatched before any item on the new-hire checklist is complete, OR I-9 not completed within 3 business days of start, OR benefits waiting period exceeds 90 days.',
  '8 USC 1324a (I-9); 15 USC 1681b(b)(2) (FCRA); 49 CFR 382.701; 49 CFR 380; 49 CFR 391.21; ACA §1201',
  'Use the TMS onboarding checklist as a dispatch block. HR signs off only when every item is captured. Audit new-hire files weekly for gaps.',
  'HR -> Safety -> Operations',
  ARRAY['DQ-001','SCREEN-001','BONUS-001','EXP-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- LEAVE-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'LEAVE-001',
  'Leave Eligibility and Tracking Per FMLA and Policy',
  'driver_employment_hr',
  'medium',
  'FMLA covers employers with 50 or more employees for 20+ workweeks. An eligible employee must have 12 months of service, 1,250 hours in the preceding 12 months, and work at a site with 50+ employees within a 75-mile radius — a nuanced test for mobile drivers whose base is the terminal. Eligible drivers receive up to 12 weeks unpaid job-protected leave (26 weeks for military caregiver). Non-FMLA leave must still follow written PTO and unpaid-leave policy to avoid inconsistent-treatment claims.',
  ARRAY['leave of absence','LOA','FMLA','medical leave','out for surgery','family leave','maternity','paternity','baby','caring for','extended leave','PTO request','vacation','out 2 weeks'],
  'Eligible FMLA request denied or not acknowledged within 5 business days with rights notice, OR eligibility miscalculated (hours/tenure/75-mile test), OR PTO applied inconsistently across drivers, OR no written leave decision on file.',
  '29 USC 2611 et seq.; 29 CFR Part 825; Company PTO Policy; state leave laws where applicable',
  'Run FMLA eligibility check within 2 business days of notice, issue WH-381 rights/responsibilities notice, request certification, and document PTO balance and approval in HRIS.',
  'HR -> Operations; Legal for complex/intermittent/ADA overlap cases',
  ARRAY['USERRA-001','EXIT-001','TERM-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- EXIT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'EXIT-001',
  'Exit Procedures, Final Paycheck, COBRA, and Equipment Return',
  'driver_employment_hr',
  'high',
  'Driver separations trigger state-specific final-paycheck timing, COBRA notification, equipment-return verification, and escrow close-out for owner-operators. California requires final pay immediately on involuntary termination (72 hours if driver quits without notice); Texas requires within 6 days of involuntary separation; Illinois, Ohio, and Tennessee default to next regular payday (OH within 15 days, TN up to 21 days later). COBRA qualifying event must reach the plan administrator within 30 days and the qualified beneficiary within 14 days thereafter.',
  ARRAY['final check','final paycheck','last paycheck','COBRA','equipment return','turn in truck','return fuel card','return ELD','exit interview','last day','quit today','terminated today','walked off'],
  'Final paycheck not issued within the applicable state deadline, OR COBRA notice to administrator exceeds 30 days or to beneficiary exceeds 14 days thereafter, OR equipment-return checklist not closed within 5 business days, OR owner-operator escrow not released within 45 days.',
  'Cal. Lab. Code §§201-202; Tex. Lab. Code §61.014; 820 ILCS 115/5; Ohio Rev. Code §4113.15; Tenn. Code §50-2-103; 29 USC 1161-1169 (COBRA); 49 CFR 376.12(k)',
  'Launch exit workflow on notice of separation: calculate final pay by state rule, schedule COBRA notice inside 30/14-day windows, verify all equipment scanned in, and trigger escrow close-out for O-Os.',
  'HR -> Accounting -> Operations; Legal for contested terminations or CA violations',
  ARRAY['TERM-001','ESCROW-001','DAC-001','DQ-002','RETAIN-001','USERRA-001','LEAVE-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- =============================================================================
-- Domain 7: Financial & Accounting Operations — 25 rules
-- Collision renames: FACT-001→FAO-FACT-001, IFTA-001→FAO-IFTA-001,
--                    CRED-001→FAO-CRED-001, DBROKER-001→FAO-DBROKER-001
-- =============================================================================

-- FAO-FACT-001 (renamed from FACT-001 — collides with existing broker-domain rule)
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FAO-FACT-001',
  'Recourse vs non-recourse factoring agreement risk',
  'financial_accounting_operations',
  'high',
  'Recourse factoring leaves the carrier liable if the broker doesn''t pay the factored invoice, creating contingent liability that can surprise cash flow. Non-recourse factoring shifts credit risk to the factor but typically at higher fees and with credit-approval gates on brokers. Tori must flag misalignment between the signed factoring agreement type and how losses are being absorbed in settlement reports.',
  ARRAY['factor charged back','chargeback from factoring','recourse invoice','buyback required','factor says broker won''t pay','non-recourse denied','credit limit exceeded on broker','factoring agreement amendment'],
  'Any factored invoice charged back to the carrier under a recourse agreement >$5,000 without accounting notification within 2 business days; OR any broker loaded by dispatch that exceeds the factor''s approved credit limit under a non-recourse agreement.',
  'UCC Article 9 (assignment of accounts receivable); FreightWaves Checkpoint factoring guide.',
  'Pull the factoring master agreement, confirm recourse classification, reconcile chargeback against original Rate Con, and either pursue broker collection internally or file a factor-handled claim within contractual deadline (typically 90 days).',
  'Accounting manager -> Controller -> Ownership (for chargebacks >$25,000)',
  ARRAY['FACT-002','FACT-003','FAO-CRED-001','AGE-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- FACT-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FACT-002',
  'Factoring fee and advance rate deviation',
  'financial_accounting_operations',
  'medium',
  'Industry-standard factoring fees run 2-5% of invoice face value; advance rates 85-95% upfront with a reserve released on broker payment. Fee creep above contract rate, advance rates dropping below contract floor, or unexplained reserve withholding silently erode margin. Tori flags deviations between the factoring statement and the negotiated rate schedule.',
  ARRAY['factoring advance','advance rate dropped','fee went up','reserve held back','factor statement short','effective rate','tiered fee kicked in','aging fee'],
  'Actual fee charged >25 basis points above contract rate on any single invoice; OR advance rate deposited <85% of invoice face without documented reserve reason; OR factoring reserve released >10 days after broker payment confirmation.',
  'Factoring master agreement (contractual); FreightWaves cost-of-factoring analysis; England Logistics factoring rate guide.',
  'Run a 30-day fee audit against the contract schedule, reconcile each invoice advance vs. face value, and escalate overbilling above $500/month to the factor rep in writing.',
  'AR specialist -> Accounting manager -> Controller',
  ARRAY['FAO-FACT-001','FACT-003','KPI-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- FACT-003
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FACT-003',
  'Notice of Assignment (NOA) compliance',
  'financial_accounting_operations',
  'high',
  'Every factored broker must receive a valid Notice of Assignment directing payment to the factor''s lockbox; payment sent to the carrier instead of the factor ("misdirected payment") creates breach of factoring agreement and can trigger chargeback plus a misdirected-payment penalty (typically 15-25% of the invoice). Tori flags any broker payment received directly to company bank once NOA is on file.',
  ARRAY['NOA','notice of assignment','misdirected payment','broker paid us direct','need to remit to factor','lockbox','pay to factor','assignment letter'],
  'Any ACH/check received from a factored broker into the company operating account instead of the factor lockbox; OR dispatch loads a broker whose NOA acknowledgment has not been returned within 30 days of first load.',
  'UCC §9-406 (account debtor notification); factoring agreement assignment clause.',
  'Remit the misdirected funds to the factor within 48 hours, re-send NOA to broker AP contact, and lock the broker in TMS until NOA acknowledgment is received.',
  'AR clerk -> Accounting manager -> Controller',
  ARRAY['FAO-FACT-001','FACT-002','APFRAUD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- AGE-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'AGE-001',
  'Invoice aging bracket monitoring',
  'financial_accounting_operations',
  'medium',
  'Receivables must be reviewed against four aging buckets: 0-30 days (current), 31-60 (watch), 61-90 (action), 90+ (escalation). In trucking, healthy operations keep >70% of AR in the 0-30 bucket and <5% in 90+. Drift above these thresholds signals broker-payment deterioration or internal billing failures.',
  ARRAY['aging report','past due','31-60 bucket','invoice past due','61-90 days','over 90','AR aging','unpaid invoice'],
  '90+ day bucket exceeds 5% of total AR; OR 61-90 day bucket exceeds 10% of total AR; OR any single invoice >$10,000 moves into 31-60 day bucket without a documented collection touch.',
  'ATA Trucking Activity Report; ATRI An Analysis of the Operational Costs of Trucking (annual); GAAP ASC 310 receivables classification.',
  'Pull the weekly aging report, assign a collection owner to every invoice in 31+ buckets, and require a daily status update on all invoices aged 61+ days until resolved.',
  'AR clerk -> Accounting manager -> Controller (if aging trends deteriorate 2 consecutive weeks)',
  ARRAY['AGE-002','AGE-003','CASH-001','KPI-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- AGE-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'AGE-002',
  'Collection escalation trigger thresholds',
  'financial_accounting_operations',
  'high',
  'Unpaid invoices demand graduated collection actions at 45, 60, and 90 days past invoice date. Missed escalations allow aged receivables to decay into uncollectible write-offs and weaken legal standing. Tori enforces that each trigger event produces the documented next step.',
  ARRAY['45 days past due','60 day demand letter','broker won''t pay','90 day escalation','send to collections','final notice','demand for payment','collection agency'],
  'No written collection contact documented by day 45; no formal demand letter by day 60; no referral to a collection agency, factor non-recourse claim, or legal counsel by day 90.',
  '49 CFR 377.203 (freight charge collection timeline); FCRA & FDCPA for third-party collections; internal credit policy.',
  'Trigger template demand letter at the 60-day mark, copy ownership, and file the 90-day referral packet (signed BOL, POD, Rate Con, invoice, statement) with the collection partner or factor.',
  'AR clerk -> Accounting manager -> Ownership -> Legal counsel (at day 90)',
  ARRAY['AGE-001','AGE-003','FAO-CRED-001','FAO-FACT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- AGE-003
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'AGE-003',
  'Write-off threshold and bad-debt tax treatment',
  'financial_accounting_operations',
  'high',
  'Trucking invoices unpaid at 120+ days generally require write-off evaluation; uncollected accounts must be formally documented as bad debt to support the IRS Publication 535 specific-charge-off deduction. Premature write-offs distort financial statements; delayed write-offs overstate receivables and understate tax deductions.',
  ARRAY['write off','bad debt','uncollectible','120 days','charge off invoice','collection failed','IRS 535','1099-C'],
  'Any invoice >=120 days past due without write-off review; OR a write-off processed without collection-attempt documentation (letters, calls, referral, skip-tracing); OR failure to issue Form 1099-C when debt >=600 is formally canceled.',
  'IRS Publication 535 (Business Expenses — Bad Debts); IRC §166; GAAP ASC 326 (CECL).',
  'Prepare the write-off memo with full collection history, book the bad debt expense, and flag the debtor for no-load status in TMS and broker credit list.',
  'Accounting manager -> Controller -> Ownership approval required for any write-off >$10,000',
  ARRAY['AGE-001','AGE-002','FAO-CRED-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- FUEL-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FUEL-001',
  'Fuel card fraud pattern detection',
  'financial_accounting_operations',
  'critical',
  'Fuel card fraud typically surfaces as off-route purchases, off-hours transactions (00:00-04:00 local), volume exceeding tank capacity, rapid multi-swipe at a single station, and skimming clones running in a different state than the tractor''s ELD location. Delay in freezing a compromised card compounds losses at approximately $1,500 per fill cycle.',
  ARRAY['suspicious charge','fuel card declined','off route fuel','card skimming','duplicate fuel charge','volume exceeds tank','fuel purchase out of state','card cloned'],
  'Single fuel purchase >150 gallons on a day-cab tractor; OR >2 purchases within 30 minutes on the same card; OR purchase location >75 miles from ELD-reported tractor position; OR purchase between 00:00-04:00 with no logged on-duty status.',
  'Fair Credit Billing Act 15 USC §1666; AICPA fraud prevention guidance; Comdata & WEX card-program fraud-monitoring standards.',
  'Freeze the card immediately, initiate dispute with the issuer within 24 hours, pull ELD and dashcam for the transaction window, and interview the driver before re-issuing a replacement card.',
  'Fuel-desk analyst -> Accounting manager -> Operations -> Ownership (if loss >$2,500)',
  ARRAY['FUEL-002','APFRAUD-001','SETTLE-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- FUEL-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FUEL-002',
  'Fuel card control configuration',
  'financial_accounting_operations',
  'high',
  'Every active fuel card must carry MCC (Merchant Category Code) restrictions to fuel/truck-stop categories only, enforce daily and weekly purchase limits, and require PIN authentication at the pump. Cards issued without these controls are the single largest vector for fuel theft in mid-sized fleets.',
  ARRAY['MCC restriction','card limit','daily limit exceeded','PIN required','fuel card setup','new driver card','override limit','merchant category'],
  'Any active card lacking MCC restriction to fuel/travel-plaza categories; OR daily limit >$800 on company-driver card without written approval; OR weekly limit >$4,000 on day-cab; OR PIN disabled on any card.',
  'Industry standard per Comdata, EFS, WEX fleet card control guides; AICPA SAS 145 internal controls.',
  'Audit the card issuer portal monthly, enforce the standard profile (fuel-only MCC, $800/day, $4,000/week, PIN mandatory), and require written CFO approval for any exception.',
  'Fuel-desk analyst -> Accounting manager -> Controller',
  ARRAY['FUEL-001','APFRAUD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- FAO-IFTA-001 (renamed from IFTA-001 — collides with existing FMCSA-domain rule)
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FAO-IFTA-001',
  'IFTA quarterly filing deadline enforcement',
  'financial_accounting_operations',
  'critical',
  'IFTA returns are due Q1 April 30, Q2 July 31, Q3 October 31, Q4 January 31. A single missed filing can trigger license revocation in the base jurisdiction, which halts interstate operation for every affected power unit. Tori must pre-stage filing readiness 10 days ahead of each deadline.',
  ARRAY['IFTA filing','IFTA return due','Q1 IFTA','fuel tax quarterly','miles report','jurisdiction miles','base state filing','IFTA portal'],
  'IFTA return unfiled past the deadline; OR mileage/fuel data not reconciled by T-10 days; OR any jurisdiction with zero miles reported when ELD data shows activity there.',
  'IFTA Articles of Agreement R950 (filing); iftach.org; base-state revenue department rules.',
  'Close the quarter''s IFTA data by T-10 days, file electronically by the deadline, and archive the confirmation PDF in the compliance folder.',
  'Accounting clerk -> Accounting manager -> Controller (if any deadline slips)',
  ARRAY['IFTA-002','HVUT-001','KPI-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- IFTA-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'IFTA-002',
  'IFTA penalty exposure and fuel tax recovery',
  'financial_accounting_operations',
  'high',
  'A late or deficient IFTA return triggers a penalty of $50 or 10% of net tax due, whichever is greater, plus per-jurisdiction interest (currently 0.4167%/month). Conversely, properly allocated miles in low-tax jurisdictions generate IFTA credits the carrier can reclaim — frequently overlooked as recoverable cash.',
  ARRAY['IFTA penalty','10% of tax due','IFTA credit','fuel tax refund','interest on IFTA','amended return','recover fuel tax','IFTA reclaim'],
  'Penalty notice received from base jurisdiction; OR amended return needed due to >5% variance between filed and actual miles; OR IFTA credit balance >$2,500 left unclaimed for >2 quarters.',
  'IFTA Articles of Agreement R1220 (penalties); R1230 (interest).',
  'File any corrective return within 30 days, request abatement if first offense with reasonable cause, and quarterly review credit balances for refund request.',
  'Accounting manager -> Controller',
  ARRAY['FAO-IFTA-001','HVUT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- PERDIEM-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'PERDIEM-001',
  'Transportation-worker per diem compliance',
  'financial_accounting_operations',
  'medium',
  'The IRS DOT special per diem rate effective Oct 1, 2024 through Sept 30, 2026 is $80/day CONUS and $86/day OCONUS (held flat across FY2025 and FY2026), and meals are 80% deductible under IRC §274(n)(3) for workers subject to DOT hours-of-service limits. Using a stale $69/day rate or applying 50% deductibility understates deductions and misstates driver settlements.',
  ARRAY['per diem','$69 per day','$80 per day','DOT per diem','meal deduction','Publication 463','80 percent','transportation worker'],
  'Driver settlement or tax provision uses per diem rate not equal to $80 CONUS / $86 OCONUS for any full travel day between Oct 1, 2024 and Sept 30, 2026; OR meal deductibility applied at 50% instead of 80% for HOS-regulated workers.',
  'IRS Notice 2024-68; IRS Publication 463; IRC §274(n)(3).',
  'Update the payroll/settlement per-diem constant to $80/day, retrain accounting on the 80% rule, and re-run prior-quarter settlements if the old rate was applied.',
  'Payroll clerk -> Accounting manager -> Controller (if prior-period adjustment needed)',
  ARRAY['SETTLE-001','1099-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- HVUT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'HVUT-001',
  'Form 2290 Heavy Highway Use Tax compliance',
  'financial_accounting_operations',
  'critical',
  'Form 2290 HVUT applies to every power unit with taxable gross weight >=55,000 lb; tax runs on a sliding scale ($100 + $22 per 1,000 lb over 55,000) and caps at $550/year for vehicles >=75,000 lb. For trucks in service in July, the return and payment are due by August 31; for new units, the return is due by the last day of the month following the first-use month. A valid stamped Schedule 1 is required for IRP registration — no stamp, no plates.',
  ARRAY['2290 due','HVUT','Schedule 1','stamped 2290','heavy use tax','Form 2290','August 31','75,000 pounds','55,000 pounds'],
  'Any power unit >=55,000 lb GVW operating without a current stamped Schedule 1; OR Form 2290 not filed by August 31 for July-active fleet; OR new unit not filed by last day of the month after first use; OR incorrect tax tier applied below the $550 cap.',
  'IRS Form 2290 Instructions (Rev. July 2025); 26 USC §4481; IRC §§4481-4484.',
  'File Form 2290 electronically by August 31 each year, pay via EFTPS or debit, and archive the stamped Schedule 1 before state IRP renewal.',
  'Compliance clerk -> Accounting manager -> Controller (if any unit operating without Schedule 1)',
  ARRAY['FAO-IFTA-001','IFTA-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- WC-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'WC-001',
  'Workers'' Compensation insurance adequacy',
  'financial_accounting_operations',
  'critical',
  'Workers'' Compensation coverage is required in nearly every state where the carrier has employees, and rates are quoted per $100 of payroll by NCCI class codes (typically trucking Class 7219/7228). A lapsed policy exposes the carrier to direct-pay medical, lost-wages liability, and state civil penalties, and disqualifies the carrier from most broker load boards.',
  ARRAY['workers comp','WC policy','WC audit','payroll audit','class code 7219','WC renewal','certificate of insurance','WC lapse'],
  'WC policy lapsed or non-renewed; OR carrier operating in a state (TX opt-out aside) where the policy does not extend coverage; OR premium audit variance >10% between declared and actual payroll; OR experience mod (EMR) >1.25 without corrective safety plan.',
  'State WC statutes (NY WCL §50; CA LC §3700); NCCI class-code tables; state department of insurance filings.',
  'Pull the current COI the first business day of each month, confirm effective dates and state endorsements, and require 30-day renewal notice from the broker.',
  'HR/Safety -> Accounting manager -> Ownership',
  ARRAY['LIAB-001','CARGO-001','LIAB-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- LIAB-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'LIAB-001',
  'Commercial auto liability minimums per 49 CFR 387.9',
  'financial_accounting_operations',
  'critical',
  'FMCSA requires minimum commercial auto liability of $750,000 for general freight, $1,000,000 for oil and non-bulk listed hazardous substances, and $5,000,000 for placardable hazmat (49 CFR 387.9). These thresholds have not changed since 1980 and remain current as of April 2026. Any operation below the applicable tier is an immediate out-of-service exposure and voids most broker contracts that require >=1M regardless of cargo.',
  ARRAY['BMC-91','BMC-91X','auto liability','$1M liability','$5M hazmat','COI required','387.9','certificate holder','cargo liability limits'],
  'Policy limit below the applicable 49 CFR 387.9 tier for any unit''s cargo type; OR BMC-91/BMC-91X not on file with FMCSA; OR broker contract requires $1M and policy carries only $750K; OR policy lapses with no new BMC-91 filing within 30 days.',
  '49 CFR 387.9; 49 CFR 387.7 (filing); Form BMC-91/BMC-91X.',
  'Confirm the BMC-91 filing status on FMCSA SAFER portal monthly, match policy limit to highest-risk cargo hauled, and refuse any load requiring coverage above current limit.',
  'Safety/Compliance -> Accounting manager -> Ownership -> Legal (for uncovered claim)',
  ARRAY['BOND-001','CARGO-001','LIAB-002','WC-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- CARGO-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'CARGO-001',
  'Cargo and trailer interchange insurance adequacy',
  'financial_accounting_operations',
  'high',
  'Brokers routinely require $100,000 minimum cargo coverage, though actual limits should match the highest commodity value hauled (reefer loads of pharma or electronics often exceed $500,000). Trailer interchange insurance covers damage to a non-owned trailer pulled under an interchange agreement — typical limits $20,000-$40,000 — and is often overlooked until a claim exposes the gap.',
  ARRAY['cargo insurance','$100,000 cargo','trailer interchange','cargo claim','reefer breakdown claim','load value exceeds','TI coverage','interchange agreement'],
  'Cargo limit <$100,000; OR single load value >90% of policy limit booked without excess; OR trailer interchange coverage absent when interchange agreement is in force; OR reefer breakdown exclusion uncovered for temperature-sensitive loads.',
  '49 CFR 387.303 (motor carrier cargo); industry broker-carrier agreement standard (TIA, C.H. Robinson contracts); AAMVA trailer interchange guidance.',
  'Set TMS to reject loads where cargo value >80% of policy limit without pre-cleared excess, and require trailer-interchange endorsement before first drop-and-hook load with any new shipper.',
  'Dispatch -> Safety -> Accounting manager -> Ownership',
  ARRAY['LIAB-001','LIAB-002','BOND-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- LIAB-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'LIAB-002',
  'Non-trucking liability (bobtail) coverage for owner-operators',
  'financial_accounting_operations',
  'high',
  'Non-trucking liability (NTL, commonly called bobtail) covers owner-operators while the tractor is operated not under dispatch — running empty home, to personal errands, or between dispatched loads. Without NTL, a personal-use accident triggers coverage denial from the primary commercial auto policy because the tractor is "not in the business of the motor carrier." Every leased owner-operator must carry NTL or be endorsed onto a fleet NTL policy.',
  ARRAY['bobtail','non-trucking liability','NTL','owner operator insurance','not under dispatch','deadhead home','OO COI','personal use coverage'],
  'Any leased owner-operator without a current NTL COI on file; OR NTL limit below $1M; OR NTL policy with "unladen while under dispatch" restriction only (gap).',
  '49 CFR 376.12 lease requirements; ISO CA 23 09 NTL endorsement; industry practice.',
  'Collect NTL COI at lease onboarding and on every renewal, require $1M minimum, and suspend the owner-operator from dispatch if COI lapses >5 days.',
  'Safety onboarding -> Accounting manager -> Ownership',
  ARRAY['LIAB-001','CARGO-001','SETTLE-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- BOND-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'BOND-001',
  'FMCSA bond filings: BMC-91/91X, BMC-84, BMC-85',
  'financial_accounting_operations',
  'critical',
  'Motor carriers file BMC-91 or BMC-91X to evidence public liability financial responsibility at the 49 CFR 387.9 level ($750K-$5M). Brokers and freight forwarders must maintain $75,000 under BMC-84 (surety bond) or BMC-85 (trust fund). Effective January 16, 2026, FMCSA''s Broker Financial Responsibility Rule restricts BMC-85 trust assets to cash, irrevocable letters of credit from federally insured depositories, and U.S. Treasury bonds, and requires sureties/trustees to notify FMCSA within 2 business days of any drawdown.',
  ARRAY['BMC-91','BMC-91X','BMC-84','BMC-85','broker bond','surety bond','$75,000 bond','trust fund','bond drawdown','387.307'],
  'BMC-91/91X missing or lapsed on SAFER; OR broker authority held without BMC-84 or compliant BMC-85; OR BMC-85 trust holding assets other than cash/LOC/Treasuries after Jan 16, 2026; OR undisclosed drawdown on broker bond of any amount.',
  '49 CFR 387.7, 387.9, 387.301, 387.307; FMCSA Broker/Freight Forwarder Financial Responsibility Rule (effective Jan 16, 2026).',
  'Pull FMCSA SAFER records monthly, confirm active BMC filings on every broker booked, and freeze any broker whose bond shows a drawdown or lapse.',
  'Compliance -> Accounting manager -> Ownership -> Legal',
  ARRAY['LIAB-001','FAO-CRED-001','FAO-DBROKER-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- FAO-CRED-001 (renamed from CRED-001 — collides with existing broker-domain rule)
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FAO-CRED-001',
  'Broker credit monitoring and load approval',
  'financial_accounting_operations',
  'high',
  'Every broker booked must clear a credit check against at least one industry monitoring service (Ansonia, RMIS, Highway, SaferWatch, CarrierSource) before dispatch. Credit scores below the internal threshold, days-to-pay above 45, or active collection flags correlate strongly with downstream non-payment. Credit decisions made after the load is under way rarely protect the invoice.',
  ARRAY['Ansonia score','RMIS check','broker credit','days to pay','credit flag','slow pay broker','do not load','Highway rating','SaferWatch alert'],
  'Load dispatched to a broker with Ansonia days-to-pay >45, OR active collection flag on any of the four services, OR credit score below internal floor; OR single-broker concentration >15% of monthly AR without secondary source confirmation.',
  'FCRA (commercial credit data handling); industry practice per Ansonia Credit Data, RMIS, Highway, SaferWatch product specs.',
  'Run pre-dispatch credit in TMS, block any broker failing threshold, and require Accounting sign-off on loads to brokers with scores within 10 points of the cutoff.',
  'Dispatcher -> Accounting manager -> Ownership (for large exposure)',
  ARRAY['AGE-002','AGE-003','FAO-FACT-001','FAO-DBROKER-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- APFRAUD-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'APFRAUD-001',
  'Accounts payable fraud detection',
  'financial_accounting_operations',
  'critical',
  'AP fraud in trucking fleets typically surfaces as duplicate invoice payments, ghost vendors (no W-9, no physical address, Gmail domain), invoice amount manipulation between approval and payment, and business-email-compromise (BEC) wire/ACH redirection. AICPA data shows median trucking AP fraud loss >$75,000 per incident and averages 14 months before detection without controls.',
  ARRAY['duplicate payment','wire fraud','vendor change request','new bank info','urgent payment','ghost vendor','invoice amount changed','business email compromise','updated ACH details'],
  'Two invoices with same vendor + same amount + same date paid within 30 days; OR new vendor paid >$1,000 with no W-9 on file; OR any vendor bank-info change not verified by phone callback to a number on file (not email-supplied); OR wire transfer >$10,000 without dual approval.',
  'AICPA SAS 145 internal controls; FBI IC3 BEC advisory; AICPA Report to the Nations on occupational fraud.',
  'Require callback verification to a previously verified phone number for any bank-info change, enforce dual approval on wires >$10,000, and run monthly duplicate-payment reports on vendor/amount/date.',
  'AP clerk -> Accounting manager -> Controller -> Ownership (for any suspected fraud) -> FBI IC3 filing',
  ARRAY['FUEL-001','FACT-003','COMCHECK-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- FAO-DBROKER-001 (renamed from DBROKER-001 — collides with existing broker-domain rule)
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FAO-DBROKER-001',
  'Double brokering detection and quick-pay abuse',
  'financial_accounting_operations',
  'critical',
  'Double brokering (same load re-brokered without authorization, multiple Rate Cons, payment routed to the wrong party) is one of the top three causes of non-payment in the current market and often pairs with identity-theft carrier spoofing. Additionally, excessive quick-pay use (any broker offering 1-3% discount for 1-3 day pay) can silently erode net margin if used on >20% of invoices without CFO approval.',
  ARRAY['double brokered','two rate cons','paid wrong party','re-brokered load','identity theft carrier','quick pay','fast pay discount','payment to unknown','MC mismatch'],
  'Any load where two different Rate Cons exist for the same MC/load #; OR payment remittance addressed to an entity other than the booking carrier; OR quick-pay usage >20% of monthly invoices without CFO sign-off; OR quick-pay discount >3% accepted on any invoice.',
  '49 CFR 371.3 (broker records), 49 CFR 371.7 (misrepresentation); FMCSA double-brokering enforcement advisories (2023-2025).',
  'Verify MC authority on FMCSA SAFER before accepting any Rate Con, match the payee on the invoice to the authority holder, and cap quick-pay usage at 20% of monthly AR with mandatory CFO approval above that.',
  'Dispatch -> Accounting manager -> Ownership -> Legal (for confirmed double-brokering theft) -> FMCSA complaint',
  ARRAY['FAO-CRED-001','FACT-003','APFRAUD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- SETTLE-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'SETTLE-001',
  'Owner-operator settlement reconciliation and escrow compliance',
  'financial_accounting_operations',
  'high',
  'Owner-operator settlements must show every deduction (fuel, insurance, maintenance, advances, tolls, Comdata fees) line-itemized per 49 CFR 376.12(k), which also requires that any escrow/performance fund specify the amount, items applied, accounting frequency, quarterly interest at the 13-week T-bill yield minimum, and return of the escrow within 45 days of lease termination. State laws (CA AB 5 independent-contractor rules; IL, NY, WA wage-deduction statutes) add further constraints.',
  ARRAY['settlement short','OO settlement','escrow balance','deduction dispute','settlement statement','45 days escrow','maintenance deduction','fuel deduction','T-bill interest','376.12'],
  'Settlement lacks itemized deduction detail; OR escrow balance not returned within 45 days of termination; OR escrow interest paid below 91-day T-bill average; OR deduction applied not enumerated in the lease.',
  '49 CFR 376.12(h), (i), (k); state wage-deduction laws.',
  'Audit 10% of settlements monthly against the lease, hold escrow return at 45-day trigger, and quarterly reconcile the interest paid to the published T-bill rate.',
  'Payroll -> Accounting manager -> Controller -> Ownership (for escrow disputes) -> Legal',
  ARRAY['1099-001','LIAB-002','PERDIEM-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- 1099-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  '1099-001',
  'Contractor 1099-NEC, quarterly estimated tax, and sales/use tax on equipment',
  'financial_accounting_operations',
  'high',
  'Form 1099-NEC must be issued to every non-corporate owner-operator or vendor paid >=600 for tax year 2025 (filed by January 31, 2026) and >=2,000 for tax year 2026 (threshold raised by the One Big Beautiful Bill Act §70433, signed July 4, 2025, indexed for inflation beginning 2027). Owner-operators must make quarterly estimated tax payments (Form 1040-ES) on Apr 15, Jun 15, Sep 15, Jan 15 to avoid IRC §6654 underpayment penalty. Tractor and trailer purchases/leases carry state-specific sales or use tax — several states (FL rolling-stock, IL ICC, TX interstate) offer exemptions the carrier must actively claim.',
  ARRAY['1099-NEC','1099 threshold','quarterly estimated tax','1040-ES','sales tax on tractor','rolling stock exemption','use tax','$600 threshold','$2000 threshold','January 31 deadline'],
  '1099-NEC not issued by January 31 for any contractor paid >=$600 (TY2025) or >=$2,000 (TY2026); OR contractor missing W-9 before first payment; OR sales/use tax paid on an equipment purchase that qualifies for rolling-stock exemption in the titling state; OR owner-operator missing any quarterly 1040-ES deadline.',
  'IRS Form 1099-NEC instructions; One Big Beautiful Bill Act of 2025 §70433; IRC §6654; state sales-tax statutes (FL §212.08(9); IL 86 Admin Code 130.340).',
  'Collect W-9 before first payment to any new vendor, run the annual 1099 cycle on a schedule starting January 10, and file for rolling-stock exemption at titling for every interstate-qualified unit.',
  'AP clerk -> Accounting manager -> Controller -> Tax CPA',
  ARRAY['SETTLE-001','PERDIEM-001','APFRAUD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- KPI-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'KPI-001',
  'Financial KPI, DSO, and fuel surcharge monitoring',
  'financial_accounting_operations',
  'medium',
  'Core trucking KPIs must be tracked weekly: operating ratio (target <95%), cost per mile (ATRI 2024 average $2.27 all-in), revenue per loaded mile, empty-mile percentage (target <12%), and days sales outstanding (typical trucking DSO 30-45 days; >50 signals collection failure). Fuel surcharge must recalculate weekly off the EIA/DOE U.S. On-Highway Diesel Retail Price (released Mondays) using the contractual cpm formula (typically (DOE price — base peg)/MPG); stale surcharge lets fuel inflation erode margin silently.',
  ARRAY['operating ratio','cost per mile','CPM','empty miles','DSO','days sales outstanding','fuel surcharge','DOE average','EIA diesel','revenue per mile','deadhead percentage'],
  'Operating ratio >97% for 2 consecutive weeks; OR DSO >45 days; OR empty-mile % >15%; OR fuel-surcharge peg not updated within 7 days of the EIA weekly release; OR cost-per-mile variance >5% week-over-week without operational cause.',
  'ATRI An Analysis of the Operational Costs of Trucking (annual); ATA Trucking Activity Report; U.S. EIA Weekly Petroleum Status Report.',
  'Publish the KPI dashboard every Monday, update the fuel-surcharge peg immediately after EIA release, and require ownership review any week OR >97%.',
  'Accounting analyst -> Controller -> Ownership',
  ARRAY['AGE-001','CASH-001','FUEL-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- COMCHECK-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'COMCHECK-001',
  'Comdata/EFS check and lumper reimbursement controls',
  'financial_accounting_operations',
  'high',
  'Comchecks, EFS checks, and TCH one-time express codes are frequently used for lumper fees, emergency repairs, and driver advances, and are a known shrinkage vector in fleets without issue-code controls. Each issuance must be tied to a load #, authorized by dispatch, capped by a single-issue dollar limit, and reconciled against a lumper receipt or repair invoice within 5 business days.',
  ARRAY['Comcheck issued','EFS code','lumper receipt','express code','TCH check','driver advance','repair invoice','lumper reimbursement','no receipt','reconcile advance'],
  'Comcheck/EFS issuance without a load # reference; OR single issuance >$500 without manager approval, or >$2,000 without controller approval; OR lumper/repair receipt not submitted within 5 business days; OR unreconciled express-code balance >$1,000 aged >15 days.',
  'Comdata and EFS fleet express-code fraud-control guides; AICPA cash-disbursement controls.',
  'Require load # entry in the express-code portal, auto-suspend a driver with >2 unreconciled codes aged 10+ days, and reconcile lumper receipts to broker accessorial billing weekly.',
  'Dispatch -> Accounting manager -> Controller -> Ownership (for any code >$2,000 unreconciled)',
  ARRAY['FUEL-001','APFRAUD-001','SETTLE-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- CASH-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'CASH-001',
  'Weekly bank reconciliation cadence',
  'financial_accounting_operations',
  'high',
  'Trucking cash flow moves daily via factoring advances, Comdata drafts, fuel-card settlements, and ACH payments, so monthly reconciliation leaves fraud and posting errors undetected for 30+ days. The industry standard is weekly reconciliation minimum on every operating, payroll, and fuel-card settlement account, with daily cash-position review for operations with >$500K monthly throughput.',
  ARRAY['bank reconciliation','weekly recon','cash position','unreconciled items','stale check','outstanding deposits','wire not posted','daily cash report','recon variance'],
  'Any bank account not reconciled within 7 calendar days of week-end; OR unreconciled variance >$500 aged >14 days; OR outstanding checks >60 days not voided/reissued; OR daily cash position report not produced when monthly throughput >$500K.',
  'AICPA SAS 145 internal controls over cash; GAAP cash cutoff; industry practice per CFMA Financial Management Benchmarker.',
  'Close each week''s reconciliation by end of day Tuesday following week-end, investigate any variance >$500 within 48 hours, and generate the daily cash-position email to ownership by 9 AM.',
  'Staff accountant -> Accounting manager -> Controller -> Ownership (for any variance >$5,000 unresolved 48h)',
  ARRAY['APFRAUD-001','COMCHECK-001','FUEL-001','KPI-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- ============================================================
-- Domain 8: Dispatch & Operations (26 Rules)
-- Collisions resolved: LANE-001->DO-LANE-001, SHIFT-001->DO-SHIFT-001, TRACK-001->DO-TRACK-001
-- ============================================================

-- ASSIGN-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'ASSIGN-001',
  'Load assignment acceptance window and refusal tracking',
  'dispatch_operations',
  'medium',
  'Drivers must confirm or refuse a tendered load within the company acceptance window so dispatch can re-tender if needed. Every refusal must be logged with a reason code distinguishing forced dispatch from driver choice. Chronic refusers and dispatchers with abnormal re-tender rates both need attention.',
  ARRAY['load tendered','driver hasn''t responded','still waiting on acceptance','load rejected','driver refused','won''t take this load','not taking it','re-tender','third refusal this week'],
  'No driver acceptance or refusal logged within 30 minutes of tender during on-duty hours; OR a driver logs 3+ refusals in a rolling 14-day window; OR a dispatcher''s overall refusal rate exceeds 10% of tenders in a week.',
  'Company Policy; ATA Driver Retention best practices; TMS tender workflow (McLeod LoadMaster, Trimble TMW.Suite, Turvo, Axon) vendor documentation.',
  'Tori pings the assigned dispatcher at the 20-minute mark and auto-escalates at 30 minutes with a suggested alternate driver from the available-capacity list. On the 3rd refusal, open a driver-coaching ticket with the refusal reasons attached.',
  'dispatch -> operations (on refusal pattern) -> ownership (on systemic dispatcher-level rate)',
  ARRAY['APPT-001','HOSPLAN-001','DISPPERF-001','CAPACITY-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- APPT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'APPT-001',
  'Appointment, FCFS, and dock-hour arrival compliance',
  'dispatch_operations',
  'high',
  'Appointment loads require arrival no earlier than 15 minutes before and no later than 15-30 minutes after the scheduled time. FCFS loads require arrival before the receiver''s stated closing cutoff with enough dwell runway to check in. Missed appointments trigger reschedule fees, OS&D risk on reefer, and CSA-adjacent service-failure claims.',
  ARRAY['late for appointment','appointment missed','no-show','reschedule fee','FCFS cutoff','receiver closes at','arrived early','driver sitting at gate','past delivery window','rolled to tomorrow'],
  'Geofence arrival stamp is earlier than appointment minus 15 min without shipper pre-approval; OR later than appointment plus 30 min; OR for FCFS, arrival stamp is within 60 min of the receiver''s posted closing time; OR any no-show with no dispatcher-logged notification to the customer at least 2 hours before the window.',
  'Company Policy; shipper/receiver SOP documents; DAT and FreightWaves SONAR industry norms on detention and service failure.',
  'Tori compares geofence stamps to appointment data in the TMS and, on projected slippage >30 min, drafts a customer-service notification template and alerts both the primary dispatcher and the customer''s assigned CSR. For FCFS, Tori flags any planned arrival that leaves under 60 min of receiver runway.',
  'dispatch -> customer_service -> operations (on repeated misses) -> ownership (on fee-generating accounts)',
  ARRAY['ETA-001','GEO-001','DWELL-001','DO-TRACK-001','HOSPLAN-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- BREAK-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'BREAK-001',
  'Breakdown reporting, roadside decision, and load rescue',
  'dispatch_operations',
  'critical',
  'Drivers must report any mechanical failure to dispatch immediately. Dispatch decides mobile mechanic vs tow based on repair scope and location, and simultaneously evaluates relay/rescue for the load. Delayed reporting and uncoordinated roadside calls are the top drivers of breakdown cost overruns.',
  ARRAY['driver broke down','truck won''t start','on the shoulder','DEF issue','blown tire','air leak','need a tow','need mobile mechanic','need relay','load rescue','engine light','trailer down'],
  'Driver-to-dispatch breakdown notification exceeds 15 min from first fault; OR no maintenance/roadside decision logged within 30 min of report; OR estimated repair time >4 hours with no relay/rescue plan initiated; OR tow dispatched for a fault mobile repair would resolve under the company threshold (typical $500 mobile vs tow decision point).',
  'Company Policy; FMCSA roadside-inspection guidance; ATRI Operational Costs of Trucking 2024/2025 (breakdown and tow cost benchmarks).',
  'Tori opens a breakdown ticket the moment a signal fires, tags location/ETA impact, and proposes either mobile mechanic (scope <4 hr, drivable-to-safe-location) or tow (safety hazard, non-drivable, or repair >4 hr). If ETA slips >2 hr, Tori drafts a relay plan using the nearest available tractor in the TMS capacity view.',
  'dispatch -> maintenance -> safety (if roadside safety exposure) -> operations -> ownership (if load value >$5k or cargo is temp-controlled)',
  ARRAY['HOSPLAN-001','ETA-001','TEAM-001','DO-TRACK-001','APPT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- WEATHER-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'WEATHER-001',
  'Severe weather routing and seasonal closures',
  'dispatch_operations',
  'high',
  'Dispatch must proactively re-route around active hurricane, tornado, ice-storm, flood, and wildfire corridors and respect seasonal closures on mountain passes and northern routes. Running into a declared state emergency or closed pass creates HOS, safety, and cargo-loss exposure.',
  ARRAY['stuck in snow','road closed','pass closed','I-80 shut down','hurricane evac','tornado warning','flooded','whiteout','ice storm','detour','can''t get through'],
  'A dispatched route crosses a segment with an active NOAA/NWS warning, a state DOT closure, or a federally declared disaster evacuation corridor; OR a northern-tier route (I-80 WY, I-90 MT/SD, US-2) is planned Nov 15-Mar 31 without a winter-weather contingency noted in dispatch notes; OR the driver is within 50 miles of an active closure without a documented re-route.',
  'FMCSA emergency declarations; state DOT 511 systems (WYDOT, MDT, CDOT, UDOT, Caltrans, WSDOT, ODOT, ITD, NDOT); NOAA NWS alerts; FEMA disaster declarations.',
  'Tori cross-references planned lanes against 511/NWS feeds every dispatch cycle, and on any hit proposes the nearest viable re-route plus updated ETA and HOS check. For seasonal northern routes in winter, Tori requires a winter contingency note before marking the load planned.',
  'dispatch -> safety -> operations -> ownership (on multi-load disruption)',
  ARRAY['CHAIN-001','HOSPLAN-001','ETA-001','HAZMAT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- CHAIN-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'CHAIN-001',
  'Western-states chain law compliance',
  'dispatch_operations',
  'high',
  'Nine western states (CO, CA, WA, OR, ID, MT, NV, UT, WY) enforce chain laws seasonally on designated routes. Dispatch must verify chain inventory and driver proficiency before routing, and drivers must comply immediately when a chain-up is declared. Running without required chains is a state citation and insurance-reportable event.',
  ARRAY['chains required','chain law in effect','chain-up station','R1','R2','R3','no chains','Vail Pass','Donner Pass','Snoqualmie','Siskiyou','Lookout Pass','cable chains only'],
  'Route assigned through a chain-control corridor during enforcement dates without confirmed chain inventory on-tractor (minimum set per state — CDOT requires chains Sep 1-May 31 on I-70 between mile 133 and 259); OR driver reports operating past a chain-up sign without chains; OR tractor sent into CA Caltrans R2/R3 advisory with only drive-axle chains when all-wheel are required.',
  'CDOT 2 CCR 601-14 (Colorado Chain Law); Caltrans CVC §605; WSDOT RCW 46.37.420; ODOT OAR 734-074; ITD IDAPA 39.03.09; MDT §61-9-406; NDOT NAC 484D; UDOT §41-6a-1636; WYDOT §31-5-955.',
  'Tori validates chain inventory against the tractor profile in the TMS fleet module before route confirmation. If chains are missing or a chain law goes active mid-route, Tori alerts dispatch to re-route below the chain-control zone or to have the driver acquire chains at the nearest TA/Petro/Love''s.',
  'dispatch -> safety -> maintenance (on inventory gap) -> operations',
  ARRAY['WEATHER-001','HOSPLAN-001','BREAK-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- HAZMAT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'HAZMAT-001',
  'Hazmat routing and placarded load restrictions',
  'dispatch_operations',
  'critical',
  'Placarded hazmat loads must follow the FMCSA National Hazardous Materials Route Registry and avoid prohibited bridges, tunnels, and populated-area restrictions. Non-compliance is a federal violation with six-figure civil penalties and immediate CSA Hazmat BASIC impact.',
  ARRAY['hazmat load','placarded','Class 3','Class 8','tunnel restriction','Lincoln Tunnel','Holland Tunnel','no hazmat route','Baltimore tunnel','George Washington Bridge','placard required','HM-232'],
  'Planned hazmat route uses a prohibited tunnel/bridge (e.g., I-95 Fort McHenry, NY Lincoln/Holland/Queens-Midtown, Boston Ted Williams for Class 1/2.3/7); OR routing crosses a state-designated non-preferred hazmat route without a written permit; OR routing violates the 49 CFR 397.67 operational requirements (no unnecessary populated-area transit).',
  '49 CFR 397 subpart C (routing); 49 CFR 1572 (HME); FMCSA National Hazardous Materials Route Registry; state hazmat route designations (e.g., NYSDOT, MdTA, PennDOT).',
  'Tori screens every placarded load''s plan against the FMCSA NHMRR and state registries. On a hit, it proposes the nearest compliant alternate and verifies the driver holds a valid HME endorsement in the driver-qual file before confirming.',
  'dispatch -> safety -> compliance -> operations -> ownership',
  ARRAY['WEATHER-001','HOSPLAN-001','DO-TRACK-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- HOSPLAN-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'HOSPLAN-001',
  'HOS planning against load ETA',
  'dispatch_operations',
  'critical',
  'Every load assignment must be paired with an HOS feasibility check confirming the driver has sufficient drive and on-duty hours to reach the delivery without violation. Dispatching into an infeasible clock is the single most common cause of HOS violations at mid-sized fleets.',
  ARRAY['running out of hours','only 2 hours left','can''t make it tonight','need a reset','34-hour restart','no hours','HOS violation','driver out of hours','split break needed','clock won''t make it'],
  'Planned ETA requires drive time exceeding the driver''s remaining 11-hour drive or 14-hour on-duty window; OR the 70/8 recap shows insufficient weekly hours; OR the plan relies on split-sleeper without documenting the 7/3 or 8/2 pairing in TMS notes.',
  '49 CFR 395.3 (HOS limits); 49 CFR 395.1(g) (sleeper berth); FMCSA ELD Rule 49 CFR 395.20-38; Samsara/Motive/Geotab ELD vendor documentation.',
  'Tori pulls ELD hours at tender and computes time-to-deliver including mandatory 30-min break and appointment dwell. If infeasible, it proposes a relay, a split-sleeper pairing, or a reassignment before tender confirmation.',
  'dispatch -> safety -> operations',
  ARRAY['ASSIGN-001','APPT-001','TEAM-001','BREAK-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- DEAD-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DEAD-001',
  'Deadhead and empty-miles targets',
  'dispatch_operations',
  'medium',
  'Empty miles directly erode margin; industry average is 15-20% and well-run fleets hold under 10-12%. Deadhead must be tracked per load, per driver, and per dispatcher, and all unpaid deadhead over company threshold requires deadhead-pay disclosure to the driver before dispatch.',
  ARRAY['empty miles high','deadhead too long','500 mile deadhead','no freight back','bobtail','driver pushing back on empty','no deadhead pay','headed home empty'],
  'Fleet weekly deadhead ratio >12%; OR individual load deadhead-to-loaded ratio >25% without a documented reposition reason; OR deadhead over 100 miles assigned without deadhead-pay entry in the TMS per company policy.',
  'ATRI Operational Costs of Trucking 2024/2025 (empty-mile benchmarks); ATA Trucking Activity Report; Company Policy on deadhead pay.',
  'Tori tags any tender with deadhead >100 mi or >25% of loaded miles and prompts dispatch to search DAT/Truckstop for a backhaul or to confirm deadhead pay. Weekly, Tori publishes deadhead-by-dispatcher to Fleet Department for review.',
  'dispatch -> operations -> ownership (on weekly trend breach)',
  ARRAY['FUELOPT-001','UTIL-001','DO-LANE-001','LOADBOARD-001','DISPPERF-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- FUELOPT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FUELOPT-001',
  'Fuel network, IFTA, and bulk-buy optimization',
  'dispatch_operations',
  'medium',
  'Drivers should fuel at in-network discount locations (TA/Petro, Pilot/Flying J, Love''s) using the company fuel card and fuel-routing plan. IFTA-aware buying — fueling in low-tax states where the route allows — and bulk-yard fueling under the company cost threshold further reduce per-mile fuel spend.',
  ARRAY['fueled off network','retail price','no discount','wrong stop','IFTA','bulk fuel','cash fuel','$4.99 diesel','fuel optimizer override','Comdata declined'],
  'Driver fuels at an out-of-network retail stop when an in-network stop was within 25 miles of the planned route; OR fueling pattern misses low-tax IFTA buy states (e.g., OK, MO, TX) when route passes through; OR bulk-yard fueling skipped when tractor passes within 10 miles of yard and tank is below 40%.',
  'IFTA Articles of Agreement; Company Policy; TA/Petro, Pilot/Flying J, Love''s fleet program documentation; fuel-optimizer vendors (ProMiles, IDSC, Trimble Fuel Dispatch).',
  'Tori compares each fuel purchase against the fuel-optimizer plan and flags off-network buys with the cost delta and IFTA impact. It nudges dispatch to reroute the driver''s next stop to the optimizer''s recommended location.',
  'dispatch -> operations -> ownership (on weekly variance >3%)',
  ARRAY['DEAD-001','UTIL-001','DO-LANE-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- UTIL-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'UTIL-001',
  'Asset utilization and revenue per truck',
  'dispatch_operations',
  'medium',
  'Fleet-wide utilization must hit the ATRI weekly benchmark of 2,500-3,000 miles per truck with a loaded-mile ratio above 88%. Revenue per truck per week must hold against the company budget, with sustained shortfalls flagged for dispatcher and lane review.',
  ARRAY['truck sitting','driver home too long','low miles this week','under 2000 miles','RPT down','revenue per truck','loaded ratio','idle trucks'],
  'Rolling 4-week miles per truck below 2,500; OR loaded-mile ratio below 88%; OR revenue per truck per week below the company budget by more than 10% for two consecutive weeks.',
  'ATRI Operational Costs of Trucking 2024/2025 (utilization benchmarks); ATA Trucking Activity Report; Company Policy.',
  'Tori posts weekly utilization by truck, by dispatcher, and by domicile to Fleet Department. For any truck under benchmark two weeks in a row, Tori opens a utilization ticket tagging the assigned dispatcher and suggesting lane or home-time adjustments.',
  'dispatch -> operations -> ownership',
  ARRAY['DEAD-001','DWELL-001','DO-LANE-001','CAPACITY-001','DISPPERF-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- DWELL-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DWELL-001',
  'Dwell time at customers and yards',
  'dispatch_operations',
  'medium',
  'Truck/trailer dwell at a shipper, receiver, or yard beyond 2 hours becomes a detention claim candidate; beyond 6 hours it materially harms utilization. Dwell must be tracked from geofence-in to geofence-out and reconciled against BOL sign times.',
  ARRAY['dwell time','been sitting 4 hours','still at dock','no door yet','waiting on paperwork','stuck at receiver','truck in yard all day','detention starting'],
  'Geofence dwell exceeds 2 hours past appointment start with no detention ticket opened; OR exceeds 6 hours at any single stop; OR trailer sits in a yard geofence >72 hours without a scheduled next move in the TMS.',
  'Company Policy; DAT detention industry data; Samsara, Project44, FourKites, MacroPoint geofence/dwell documentation.',
  'At 2 hours, Tori prompts dispatch to open a detention ticket with timestamped arrival and photos of the BOL. At 6 hours, Tori escalates to operations and drafts a customer-service notification. Trailers idle >72 hours generate a yard-reposition task.',
  'dispatch -> customer_service -> operations -> ownership (on chronic accounts)',
  ARRAY['APPT-001','GEO-001','TPOOL-001','DO-TRACK-001','YARD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- GEO-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'GEO-001',
  'Geofence stamp integrity (arrival, departure, BOL)',
  'dispatch_operations',
  'medium',
  'Arrival and departure geofence stamps must reconcile with appointment times and BOL sign times. Large deltas between stamps and BOL indicate manual check-in lag, off-system dwell, or falsified timekeeping — all of which damage detention claims and customer trust.',
  ARRAY['no arrival stamp','geofence didn''t trigger','macro 1 missing','arrived but no ping','BOL signed at','departure not logged','manual arrival','GPS off'],
  'Arrival geofence stamp differs from appointment time by more than 60 min with no manual reason code; OR departure stamp differs from BOL signed time by more than 30 min; OR any geofence stamp is missing entirely on a completed load.',
  'Samsara, Project44, FourKites, MacroPoint vendor documentation; TMS geofence configuration (McLeod, TMW, Turvo, Axon).',
  'Tori reconciles every completed load''s geofence stamps with BOL and appointment data and flags mismatches to the assigned dispatcher for same-day correction. Repeat stamp failures on a tractor trigger a telematics health check.',
  'dispatch -> operations -> maintenance (if telematics hardware)',
  ARRAY['APPT-001','DWELL-001','DO-TRACK-001','ETA-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- TEAM-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'TEAM-001',
  'Team driver operations and split-sleeper coordination',
  'dispatch_operations',
  'high',
  'Team trucks and relay plans require dual-driver HOS planning, clean split-sleeper berth documentation, and explicit hand-off points. Dispatch failures on team loads cause compounded HOS violations and missed expedited commitments.',
  ARRAY['team load','co-driver','split sleeper','7/3 split','8/2 split','relay at','swap drivers','team truck down','driver not in berth'],
  'Team load planned with one driver''s 70-hour clock insufficient for their half of the run; OR split-sleeper pairing not documented as 7/3 or 8/2 per 49 CFR 395.1(g); OR relay hand-off location assigned without a confirmed meet time and truck/trailer number in TMS.',
  '49 CFR 395.1(g) split sleeper; 49 CFR 395.3 HOS; FMCSA team-driving guidance.',
  'Tori validates both drivers'' ELD clocks at team-load tender, confirms split-sleeper pairings are compliant, and requires a meet-point row in the TMS for any relay. Missing data blocks dispatch confirmation.',
  'dispatch -> safety -> operations',
  ARRAY['HOSPLAN-001','EXPED-001','BREAK-001','ETA-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- YARD-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'YARD-001',
  'Yard check and physical trailer reconciliation',
  'dispatch_operations',
  'medium',
  'Weekly minimum physical yard checks must reconcile trailers on the ground against TMS records and asset-gateway GPS. Discrepancies hide lost trailers, missed drop/hook opportunities, and customer-owned-trailer trespass risk.',
  ARRAY['yard check','trailer not here','can''t find trailer','TMS says trailer in yard','ghost trailer','missing from yard','inventory mismatch'],
  'Any yard goes more than 7 days without a documented yard check; OR physical count differs from TMS count by >2 trailers; OR an asset-gateway GPS location and TMS location disagree for >24 hours on any trailer.',
  'Company Policy; SkyBitz, Spireon FleetLocate, Samsara Asset Gateway vendor documentation.',
  'Tori schedules the weekly yard check by domicile, pulls the TMS and asset-GPS lists for comparison, and opens reconciliation tasks for every discrepancy. Trailers missing >48 hours are escalated as potential loss.',
  'dispatch -> operations -> ownership (on loss) -> safety (on potential theft)',
  ARRAY['TPOOL-001','DWELL-001','DO-TRACK-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- TPOOL-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'TPOOL-001',
  'Trailer pool, drop-and-hook, and turn time',
  'dispatch_operations',
  'medium',
  'Customer trailer pools must stay within the contracted pool ratio (typical 2.5-3.0 trailers per daily load) with documented turn times. Pool imbalance causes live-load fallbacks, detention, and lost drop-and-hook advantage.',
  ARRAY['no trailer available','pool short','live load instead','trailer turn','pool ratio','empty trailer needed','drop and hook','customer owned trailer'],
  'Pool trailer count falls below contracted ratio; OR trailer turn time exceeds the customer SLA (commonly 48 or 72 hours); OR live-load fallback is used more than 10% of pool loads in a week.',
  'Customer master transportation agreements; Company Policy; SkyBitz/Spireon/Samsara asset-tracking vendor documentation.',
  'Tori tracks pool count, turn time, and live-load fallback rate per customer and alerts the primary dispatcher when ratios breach. It proposes reposition moves to rebalance the pool using the lowest-deadhead tractor.',
  'dispatch -> customer_service -> operations',
  ARRAY['YARD-001','DEAD-001','DWELL-001','DO-TRACK-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- INTER-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'INTER-001',
  'Intermodal and rail-ramp operations',
  'dispatch_operations',
  'high',
  'Container and chassis moves must honor ramp cut-off times, last-free-day, and per-diem clocks. Missing a ramp close causes a 24-hour delay plus chassis/container per-diem; missing LFD triggers demurrage billable to the carrier.',
  ARRAY['ramp closed','last free day','per diem','container per diem','chassis split','UP ramp','BNSF ramp','ingate cutoff','street turn','demurrage'],
  'Intermodal move planned with arrival within 60 min of ramp close; OR LFD passes with container still out; OR chassis held >7 days without a street-turn or return plan; OR per-diem chassis days exceed company monthly budget.',
  'BNSF/UP/NS/CSX ramp operating schedules; IANA intermodal interchange rules; UIIA chassis provisioning standards (TRAC, DCLI, Flexi-Van).',
  'Tori syncs ramp-close times daily per terminal and blocks assignments that can''t hit the cutoff with a 60-min buffer. LFD-threatened containers generate a priority reposition task routed to the assigned intermodal dispatcher.',
  'dispatch -> operations -> customer_service -> ownership (on demurrage accrual)',
  ARRAY['APPT-001','HOSPLAN-001','TPOOL-001','ETA-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- PORT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'PORT-001',
  'Port operations, TWIC, and terminal appointments',
  'dispatch_operations',
  'high',
  'Port drayage requires a valid TWIC card, a confirmed appointment in the terminal system (eModal, Port Optimizer, Voyage Control, TideWorks), and a clean driver/tractor registration with the port community system. Missing any of these bricks the move at the gate.',
  ARRAY['TWIC expired','no appointment','eModal','Port Optimizer','turned away at gate','Trapac','PierPass','TMF fee','appointment not found','dual transaction'],
  'Driver assigned to a port move with TWIC expiring within 30 days; OR no terminal appointment confirmed in eModal/Port Optimizer at least 2 hours before the window; OR tractor/driver not registered in the port community system (e.g., eModal RFID, PortCheck).',
  '49 CFR 1572 (TWIC); 33 CFR 105 (MTSA); port authority rules — POLA/POLB Port Optimizer, NY/NJ eModal, USACE, Port of Oakland, Port of Savannah GPA Navis N4.',
  'Tori validates TWIC expiration in the driver-qual file and appointment status in the terminal system at tender. On any gap it blocks dispatch confirmation and opens a remediation task (TWIC renewal or appointment booking).',
  'dispatch -> compliance -> safety -> operations',
  ARRAY['INTER-001','HAZMAT-001','APPT-001','HOSPLAN-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- EXPED-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'EXPED-001',
  'Expedited and hot-load execution',
  'dispatch_operations',
  'high',
  'Expedited, hot, and premium-rate loads demand team drivers or continuous solo coverage, direct routing, and proactive tracking at tighter cadence. A service failure on a premium-rate load is both financially and reputationally costly.',
  ARRAY['hot load','expedited','team required','premium rate','direct to','no stops','must deliver','tight window','white glove','high value'],
  'Expedited load dispatched solo when team required per customer contract; OR routed with a planned non-fuel stop exceeding 30 min; OR tracking cadence set to default instead of 1-hour updates; OR ETA margin to appointment under 10% of planned transit.',
  'Customer master agreements; Company Policy; FMCSA HOS 49 CFR 395; MacroPoint/Project44/FourKites premium SLA documentation.',
  'Tori flags every expedited/hot tender and validates team status, direct-route plan, and tracking cadence before confirmation. Any ETA margin under 10% triggers an automatic customer-service heads-up draft.',
  'dispatch -> operations -> customer_service -> ownership (on premium-rate failure)',
  ARRAY['TEAM-001','DO-TRACK-001','ETA-001','HOSPLAN-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- ETA-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'ETA-001',
  'ETA update cadence and exception communication',
  'dispatch_operations',
  'medium',
  'Dispatch must publish at least 3 ETA updates per day per active load (morning, midday, pre-delivery) plus exception updates on any slippage >30 min. Brokers and shippers increasingly score carriers on tracking compliance, affecting lane awards.',
  ARRAY['ETA late','ETA update','running behind','no ETA given','broker asking for update','check call missed','status update','macro 8','hours out'],
  'Fewer than 3 ETA updates logged per active load per day; OR any ETA slippage >30 min without a customer notification within 15 min of detection; OR broker-portal tracking score below 95% on-time events for the month.',
  'MacroPoint, Project44, FourKites vendor documentation; broker tracking SLAs (CH Robinson Navisphere, Convoy-style portals, Uber Freight); Company Policy.',
  'Tori monitors ETA vs plan continuously from telematics and auto-drafts the customer notification on any >30-min slip. Missed daily update counts escalate at end-of-shift to the inbound dispatcher for catch-up.',
  'dispatch -> customer_service -> operations',
  ARRAY['DO-TRACK-001','APPT-001','EXPED-001','GEO-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- DO-TRACK-001 (renamed from TRACK-001 — collides with broker_customer_relations TRACK-001)
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DO-TRACK-001',
  'Tracking platform compliance (MacroPoint, Project44, FourKites)',
  'dispatch_operations',
  'high',
  'Broker-mandated tracking via MacroPoint, Project44, or FourKites must stay connected from tender acceptance to POD. Disconnections, opt-outs, and permission failures cause carrier-scorecard downgrades and load-board visibility penalties.',
  ARRAY['tracking dropped','MacroPoint disconnected','no location','tracking not working','Project44 error','FourKites offline','driver declined tracking','permission denied','scorecard down'],
  'Any gap in tracking >30 min during active transit; OR driver opts out of the broker-mandated tracking app; OR carrier scorecard on any major broker falls below 95% tracking compliance for the month.',
  'Descartes MacroPoint, Project44, FourKites vendor documentation; broker master agreements (CH Robinson, TQL, Coyote, Uber Freight, Arrive).',
  'Tori monitors tracking session health and pings the driver and dispatcher on any >30-min gap. Repeated driver opt-outs open a coaching ticket; platform-side failures trigger an IT support request.',
  'dispatch -> operations -> customer_service',
  ARRAY['ETA-001','GEO-001','EXPED-001','APPT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- TMS-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'TMS-001',
  'Load tendering and TMS data hygiene',
  'dispatch_operations',
  'high',
  'Every load must be tendered through the TMS (McLeod, TMW/Trimble, Turvo, or Axon) with complete customer, rate, commodity, appointment, and driver-assignment data before driver notification. Off-system loads break billing, settlements, IFTA, and CSA data flows.',
  ARRAY['off TMS','not in McLeod','manual rate con','no load number','billing missing','comcheck without load','entered tomorrow','covered by text only'],
  'Driver dispatched before the load reaches "Planned" or "Dispatched" status in the TMS; OR a rate confirmation is accepted without a TMS load number within 2 hours; OR mandatory fields (rate, commodity, weight, appointment) are blank at dispatch.',
  'McLeod LoadMaster, Trimble TMW.Suite/Innovative, Turvo, Axon Software vendor documentation; Company Policy.',
  'Tori blocks the dispatch-confirmation signal on any incomplete TMS record and lists missing fields to the dispatcher. Off-system dispatches auto-generate a back-entry task with a 2-hour deadline.',
  'dispatch -> operations -> ownership (on billing impact)',
  ARRAY['ASSIGN-001','LOADBOARD-001','DISPPERF-001','ETA-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- LOADBOARD-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'LOADBOARD-001',
  'Load board discipline and power-only sourcing',
  'dispatch_operations',
  'medium',
  'Dispatchers use DAT, Truckstop, and Uber Freight within the company rate-per-mile floor and broker-approval list, and verify posted vs hidden rates before booking. Power-only loads additionally require a confirmed drop-trailer availability at origin.',
  ARRAY['DAT','Truckstop','Uber Freight','posted rate','hidden rate','below floor','$1.80 per mile','unverified broker','power only','no trailer at origin','drop trailer available'],
  'Load booked below the company RPM floor (typical $2.00 dry van, $2.30 reefer, $2.60 flatbed, 2025 market) without ownership approval; OR broker not on approved list (credit score <90 or DNU); OR power-only load booked without confirmed origin drop-trailer availability in writing.',
  'DAT RateView, Truckstop Market Intelligence, FreightWaves SONAR, Uber Freight carrier terms; Company Policy; broker credit via Ansonia/TriumphPay/RTS.',
  'Tori cross-checks every load-board booking against the RPM floor, the approved-broker list, and — for power-only — the origin trailer confirmation. Sub-floor bookings require ownership approval captured in Telegram before Tori clears the booking.',
  'dispatch -> operations -> ownership (on rate-floor breach)',
  ARRAY['ASSIGN-001','DEAD-001','DO-LANE-001','TMS-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- DISPPERF-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DISPPERF-001',
  'Dispatcher performance and customer-account coverage',
  'dispatch_operations',
  'medium',
  'Each dispatcher owns 30-50 trucks with clear primary/secondary account assignments, tracked on loads moved, revenue generated, and driver turnover in their book. Span-of-control drift and unassigned accounts cause service gaps and retention failure.',
  ARRAY['dispatcher short','too many trucks','who covers this account','no backup','dispatcher overloaded','RPT low under','driver quit on','customer complaint on dispatcher'],
  'Any dispatcher assigned fewer than 25 or more than 55 trucks; OR revenue per dispatcher below the company quarterly target by >10%; OR driver turnover under a single dispatcher exceeds 75% annualized; OR any active customer account without a named primary and secondary dispatcher.',
  'ATA Driver Retention Benchmark; ATRI Operational Costs of Trucking 2024/2025; Company Policy.',
  'Tori publishes weekly span-of-control, revenue-per-dispatcher, and under-dispatcher turnover dashboards to Fleet Department. Unassigned accounts trigger an immediate assignment prompt to operations.',
  'dispatch -> operations -> ownership',
  ARRAY['UTIL-001','DO-SHIFT-001','AFTERHR-001','DO-LANE-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- DO-SHIFT-001 (renamed from SHIFT-001 — collides with load_cargo_operations SHIFT-001)
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DO-SHIFT-001',
  'Shift hand-off notes between inbound and outbound dispatch',
  'dispatch_operations',
  'high',
  'Every shift change requires a written hand-off covering active breakdowns, at-risk ETAs, pending customer callbacks, and in-flight tenders. Gaps here are the top source of missed appointments and duplicate customer contacts during overnight transitions.',
  ARRAY['shift change','hand-off','night shift','day shift','passdown','pending callback','open ticket','at risk loads','nothing to report','no notes left'],
  'Shift ends without a hand-off note posted to the Dispatch Team channel covering breakdowns, at-risk ETAs, callbacks, and pending tenders; OR the incoming shift acknowledges hand-off >30 min after shift start; OR any critical item (breakdown, HOS risk, port appointment) omitted from the note.',
  'Company Policy; ATA dispatch operations guidance.',
  'Tori enforces a hand-off template at shift end, auto-populates breakdowns and at-risk ETAs from the TMS, and requires acknowledgement from the incoming dispatcher within 30 min. Missing items block the hand-off submission.',
  'dispatch -> operations -> ownership (on repeated misses)',
  ARRAY['AFTERHR-001','BREAK-001','ETA-001','DISPPERF-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- AFTERHR-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'AFTERHR-001',
  'After-hours, weekend, and emergency-line coverage',
  'dispatch_operations',
  'high',
  'After-hours and weekend coverage must have a named on-call dispatcher, a monitored emergency line, and a defined response SLA for breakdowns, accidents, and customer escalations. Unstaffed gaps create safety exposure and customer-churn risk.',
  ARRAY['after hours','on call','weekend coverage','emergency line','no answer','nobody responded','holiday coverage','night dispatcher','rotating on call'],
  'Any hour outside business hours without a named on-call dispatcher in the rotation calendar; OR emergency-line call unanswered for >15 min; OR breakdown/accident acknowledgment from on-call >30 min from driver report.',
  'Company Policy; FMCSA post-accident procedures 49 CFR 390.15; ATA safety operations guidance.',
  'Tori validates the on-call rotation calendar daily and alerts operations if any shift is unstaffed. It monitors emergency-line timestamps and escalates any unanswered call at 15 min.',
  'dispatch -> operations -> safety -> ownership',
  ARRAY['DO-SHIFT-001','BREAK-001','DISPPERF-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- DO-LANE-001 (renamed from LANE-001 — collides with driver_safety_behavior LANE-001)
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DO-LANE-001',
  'Lane profitability discipline and capacity planning',
  'dispatch_operations',
  'high',
  'Lanes consistently running below the company margin floor must be flagged and re-priced or dropped, and capacity must be matched against forecasted demand by week and season. Sustained lane losses and chronic over/under-capacity erode both margin and driver satisfaction.',
  ARRAY['losing money on','bad lane','unprofitable','keep losing on','no capacity','too many trucks for freight','seasonal peak','produce season','retail peak','capacity planning'],
  'Any lane with margin below the company floor (typical 8% contribution) for 3+ consecutive weeks without a renegotiation or drop action; OR available capacity exceeds forecasted demand by >15% in any weekly forecast; OR seasonal peak (produce May-Jul, retail Oct-Dec) entered without a capacity plan documented.',
  'DAT RateView, FreightWaves SONAR, ATRI Operational Costs of Trucking 2024/2025, USDA Market News (produce seasonality); Company Policy.',
  'Tori publishes a weekly lane-P&L and capacity-vs-demand report. Lanes under floor for 3 weeks auto-generate a renegotiation task; demand/capacity mismatches prompt a recruiting or reposition plan routed to operations.',
  'dispatch -> operations -> ownership',
  ARRAY['DEAD-001','UTIL-001','DISPPERF-001','LOADBOARD-001','FUELOPT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- ============================================================
-- Domain 9: Incident & Claims Management — 25 rules
-- Collision renames (ICM- prefix applied to IDs that already
-- exist in other domains):
--   DASH-001  → ICM-DASH-001   (was driver_safety_behavior)
--   ROLL-001  → ICM-ROLL-001   (was driver_safety_behavior)
--   COACH-001 → ICM-COACH-001  (was driver_safety_behavior)
--   THEFT-001 → ICM-THEFT-001  (was load_cargo_operations)
--   DENY-001  → ICM-DENY-001   (was broker_customer_relations)
--   WC-001    → ICM-WC-001     (was financial_accounting_operations)
-- All related_rules references within Domain 9 updated to match.
-- ============================================================

-- ACC-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'ACC-001',
  'DOT recordable accident classification',
  'incident_claims_management',
  'critical',
  'Any occurrence involving a CMV on a public roadway must be evaluated against the three §390.5T triggers within 60 minutes of notification. Misclassifying a recordable event as non-recordable distorts the Accident Register and the FMCSA Crash Indicator BASIC, and can trigger a compliance review finding.',
  ARRAY['accident','crash','collision','rear-ended','T-boned','tow truck','towed from scene','ambulance','medevac','life flight','fatality','disabling damage','injury transported','wrecker called'],
  'Event involving a CMV resulting in (a) a fatality, OR (b) bodily injury to any person who immediately receives medical treatment away from the scene, OR (c) one or more vehicles incurring disabling damage requiring tow-away — and the event is not logged as DOT-recordable within 60 minutes of notification.',
  '49 CFR 390.5T (definition of "accident"); 49 CFR 390.15',
  'Flag the incident as DOT-recordable; open an Accident Register entry; trigger post-accident testing evaluation (PAT-001/PAT-002); notify Safety Director within 60 minutes.',
  'Safety Director → Director of Operations → Insurance → Ownership (for fatality/critical injury)',
  ARRAY['PAT-001','PAT-002','REG-001','RPT-001','FATAL-001','ICM-COACH-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- PAT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'PAT-001',
  'Post-accident alcohol test within 8 hours',
  'incident_claims_management',
  'critical',
  'Alcohol testing on a driver involved in a qualifying accident must be attempted continuously and the test must be performed as soon as practicable. After 2 hours without a test, a written record explaining the delay is required; after 8 hours, attempts must cease and a written record of reasons must be retained.',
  ARRAY['post-accident test','breathalyzer','BAC','alcohol test','PAT','no testing facility','driver refused test','can''t find a clinic','too far from collection site'],
  'Driver subject to §382.303 (fatality, or citation + injury with treatment away from scene, or citation + disabling damage) and alcohol test not completed within 8 hours of the accident without a §382.303(d)(1) written record on file.',
  '49 CFR 382.303(a), 382.303(d)(1)',
  'Dispatch driver to nearest DOT-certified collection site immediately; if >2 hours elapsed, start the §382.303(d)(1) written-record memo; if >8 hours, cease attempts and complete the written explanation.',
  'Safety → DER (Designated Employer Representative) → HR',
  ARRAY['ACC-001','PAT-002','FATAL-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- PAT-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'PAT-002',
  'Post-accident drug test within 32 hours',
  'incident_claims_management',
  'critical',
  'Controlled-substance testing must be performed on the driver as soon as practicable but no later than 32 hours after the qualifying accident. If the window is missed, attempts cease and the employer must prepare and retain a written record stating the reasons.',
  ARRAY['drug test','urine test','oral fluid test','DOT panel','32 hours','collection site closed','missed the window','couldn''t get tested'],
  'Driver subject to §382.303 and controlled-substance specimen not collected within 32 hours of the accident without a §382.303(d)(2) written record on file explaining why.',
  '49 CFR 382.303(a), 382.303(d)(2); 49 CFR Part 40',
  'Route driver to nearest 24-hour DOT collection site; if 32 hours will be exceeded, stop attempts and generate the §382.303(d)(2) memo documenting reasons and maintain in the DER file.',
  'Safety → DER → HR → Legal (if test missed)',
  ARRAY['ACC-001','PAT-001','FATAL-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- INVEST-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'INVEST-001',
  'Scene preservation and investigation documentation',
  'incident_claims_management',
  'high',
  'A complete investigation packet must be captured at every recordable accident scene to support defense against nuclear-verdict litigation and subrogation. Missing or delayed evidence collection is a leading driver of adverse claim outcomes.',
  ARRAY['police on scene','officer badge','accident report number','witness','witnesses','took pictures','got photos','skid marks','intersection','mile marker','no dashcam yet'],
  'Within 4 hours of a recordable accident, any of the following missing: (a) multi-angle damage photos of all vehicles, (b) GPS coordinates or mile-marker of scene, (c) police/agency report number and officer name, (d) witness names + phone numbers, (e) road/weather/lighting conditions, (f) photos of cargo and trailer interior if involved.',
  '49 CFR 390.15(b)(2) (copies of accident reports required by state/insurers); industry best practice aligned with ATRI nuclear-verdict defense research (2020, 2025 updates)',
  'Deploy digital investigation checklist to driver/safety team; confirm each item received; open claim file and upload to DMS within 24 hours.',
  'Safety → Claims → Insurance carrier → Legal (if injury/fatality)',
  ARRAY['ACC-001','ICM-DASH-001','LITHOLD-001','NUCLEAR-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- ICM-DASH-001 (renamed from DASH-001 — collides with driver_safety_behavior DASH-001)
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'ICM-DASH-001',
  'Dashcam, ELD, and telematics preservation before overwrite',
  'incident_claims_management',
  'critical',
  'Lytx, Samsara, Motive, and similar platforms overwrite video on a rolling basis (typically 30 days for dashcam, 6 months for ELD RODS). Any dashcam clip or ELD data relevant to a recordable accident, injury, cargo claim, or litigation must be exported and preserved in permanent storage before overwrite.',
  ARRAY['Lytx','Samsara','Motive','Netradyne','dashcam','dash cam','event video','hard brake','forward-facing','driver-facing','ELD data','RODS','telematics pull'],
  'A recordable accident, injury incident, cargo claim >$5,000, or litigation hold notice exists and the relevant dashcam/ELD/GPS data has not been exported to permanent storage within 7 calendar days of the event, OR has not been preserved at all before the platform''s overwrite cycle.',
  '49 CFR 395.8 (ELD record retention 6 months); 49 CFR 390.15(b); common-law spoliation doctrine; Federal Rules of Civil Procedure 37(e)',
  'Pull and export forward + driver-facing video ±60 seconds around event; export 7 days of ELD RODS, GPS breadcrumbs, hard-brake/speed events; store in the claim file with hash-verified chain of custody.',
  'Safety → IT/Telematics Admin → Claims → Legal',
  ARRAY['ACC-001','INVEST-001','LITHOLD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- REG-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'REG-001',
  'Accident Register maintenance, 3-year retention',
  'incident_claims_management',
  'high',
  'The carrier must maintain an Accident Register capturing every §390.5T recordable accident for 3 years from the date of each accident, with all six data fields and attached state/insurer accident reports.',
  ARRAY['accident register','390.15','log the accident','register entry','compliance review','FMCSA audit','new entrant audit'],
  'Any DOT-recordable accident not entered in the Accident Register within 30 days of the event, OR register entry missing any required field: (1) date, (2) city/town and state, (3) driver name, (4) number of injuries, (5) number of fatalities, (6) hazmat release indicator (excluding fuel from CMV tanks), or (7) copies of state/insurer accident reports; OR register purged before 3-year retention expires.',
  '49 CFR 390.15(b)(1)-(2)',
  'Auto-populate register from the incident intake record; attach police report PDF and insurer FNOL document; set retention flag for 3 years + 1 day.',
  'Safety → Compliance → DOT Director',
  ARRAY['ACC-001','FATAL-001','SPILL-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- RPT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'RPT-001',
  'Immediate internal and insurer notification windows',
  'incident_claims_management',
  'high',
  'Drivers must notify dispatch/safety immediately after any accident, injury, theft, or spill. Insurance carrier First Notice of Loss (FNOL) must be filed within the policy-specified window (typically 24 hours; some auto liability policies require "as soon as practicable").',
  ARRAY['just had an accident','need to report','call dispatch','call safety','FNOL','first notice of loss','notify insurance','tell the carrier','policy 24 hours'],
  '(a) Driver fails to notify dispatch/safety before leaving the scene (absent a medical emergency), OR (b) insurance carrier FNOL not submitted within 24 hours of the event unless a shorter policy window applies, OR (c) notification missing any of: date/time, location, injuries, police report #, third-party info, cargo status.',
  'Carrier policy terms; company safety policy; 49 CFR 390.15(b)(2) (retention of insurer reports)',
  'Trigger FNOL template pre-filled from the incident intake; submit to primary auto liability and cargo carriers; confirm adjuster assignment within 4 business hours.',
  'Driver → Dispatch → Safety → Claims → Insurance carrier',
  ARRAY['ACC-001','INVEST-001','ICM-THEFT-001','SPILL-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- FATAL-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FATAL-001',
  'Fatality accident protocol',
  'incident_claims_management',
  'critical',
  'A CMV accident involving any fatality triggers parallel DOT, OSHA, and law-enforcement obligations. A fatality is a mandatory post-accident drug and alcohol test trigger regardless of citation status, and invokes immediate senior-leadership and legal notification.',
  ARRAY['fatality','fatal','DOA','pronounced dead','coroner','medical examiner','killed','died at the scene','life-flight pronounced','pedestrian struck','motorcycle fatality'],
  'Any of the following not completed on a fatality accident: (a) driver PAT alcohol within 8 hrs / drug within 32 hrs irrespective of citation, (b) immediate on-scene cooperation with law enforcement and DOT, (c) notification to ownership + insurance + legal within 2 hours, (d) OSHA fatality report if the fatality is a company employee and not excluded under §1904.39(b)(3), (e) litigation-hold issued within 24 hours.',
  '49 CFR 382.303(a)(1); 49 CFR 390.5T; 29 CFR 1904.39(a)(1); 29 CFR 1904.39(b)(3) (highway-accident carve-out for public-road crashes outside work zones)',
  'Immediately initiate PAT-001 and PAT-002; dispatch senior safety personnel to scene; notify ownership, insurance, and outside trucking defense counsel; issue litigation hold (LITHOLD-001); assess §1904.39 OSHA reportability.',
  'Safety → Ownership → Legal → Insurance → OSHA (if applicable)',
  ARRAY['ACC-001','PAT-001','PAT-002','OSHA-001','LITHOLD-001','NUCLEAR-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- HITRUN-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'HITRUN-001',
  'Hit-and-run and leaving the scene',
  'incident_claims_management',
  'critical',
  'A driver leaving the scene of any accident involving another party or property damage exposes the company to criminal liability, insurance coverage denial, and negligent-retention claims. Immediate law-enforcement notification is mandatory.',
  ARRAY['hit and run','didn''t stop','driver kept going','left the scene','we got hit and they took off','nobody around','phantom vehicle','sideswipe and left'],
  '(a) Company driver involved in contact with another vehicle, pedestrian, or property and did not stop, call 911, and exchange information, OR (b) company vehicle struck by a fleeing third party and law-enforcement report not filed within 2 hours.',
  'State "leaving the scene" statutes (felony if injury/fatality); 49 CFR 391.15 (disqualification for leaving scene of accident resulting in injury/fatality)',
  'Order driver to return to scene if safe; if driver is the victim, file police report within 2 hours with all available third-party descriptors, dashcam, and GPS; notify insurance UM/UIM coverage; preserve dashcam (ICM-DASH-001).',
  'Safety → Legal → HR (if driver at fault) → Insurance',
  ARRAY['ACC-001','ICM-DASH-001','INVEST-001','LITHOLD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- ICM-ROLL-001 (renamed from ROLL-001 — collides with driver_safety_behavior ROLL-001)
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'ICM-ROLL-001',
  'Rollover accident response',
  'incident_claims_management',
  'critical',
  'Tractor or trailer rollovers frequently produce diesel spills (saddle-tank rupture), cargo spill, and extended lane closures, triggering hazmat/environmental, heavy-tow, and liability cascades. A coordinated rollover protocol must run in parallel with the standard accident response.',
  ARRAY['rollover','rolled over','on its side','on its roof','tipped over','trailer flipped','ramp rollover','curve','cloverleaf','diesel leaking from saddle tank','load spilled'],
  'A rollover event where, within 2 hours, any of: (a) heavy-recovery/specialized tow not dispatched, (b) fuel/cargo spill containment not assessed, (c) NRC sheen-rule reporting not evaluated if fluid entering storm drain/waterway, (d) DOT hazmat reportability not screened (SPILL-001), (e) lane-closure duration not logged for §171.15 1-hour evaluation.',
  '49 CFR 390.5T; 49 CFR 171.15; 40 CFR 110.3 (sheen rule); 40 CFR 112 (SPCC for >1,000 gal discharge)',
  'Dispatch specialized heavy-recovery; deploy absorbent booms if fuel release suspected; trigger SPILL-001 screen; coordinate with state DOT for lane closure; preserve all dashcam + ELD (ICM-DASH-001).',
  'Safety → Operations → Maintenance → Claims → Insurance → Environmental consultant (if spill)',
  ARRAY['ACC-001','SPILL-001','ICM-DASH-001','CARGOCLAIM-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- JACK-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'JACK-001',
  'Jackknife and trailer separation',
  'incident_claims_management',
  'high',
  'A jackknife or trailer separation typically blocks multiple lanes and produces secondary-crash risk. The driver must secure the scene with reflective triangles per §392.22, notify dispatch immediately, and request specialized recovery; cargo shift must be assessed before any trailer movement.',
  ARRAY['jackknifed','jackknife','trailer swung','lost the trailer','trailer separation','kingpin failure','fifth wheel','fishtail','fishtailing','cab-over-trailer'],
  'Jackknife or uncoupling event where within 30 minutes: (a) §392.22 warning-device triangles not deployed, (b) 911/state patrol not notified if lane blocked, (c) dispatch/safety not notified, (d) trailer moved before cargo shift / load integrity assessed, or (e) dashcam/ELD preservation not initiated.',
  '49 CFR 392.22 (emergency signals); 49 CFR 390.5T; 49 CFR 393.70 (coupling)',
  'Confirm triangles deployed at 10/100/200 ft; dispatch heavy-duty wrecker rated for GVW; inspect fifth wheel, kingpin, and air/electrical lines; hold trailer for maintenance root-cause before returning to service.',
  'Safety → Maintenance → Operations → Claims',
  ARRAY['ACC-001','ICM-ROLL-001','ICM-DASH-001','CARGOCLAIM-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- CARGOCLAIM-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'CARGOCLAIM-001',
  'Carmack Amendment 9-month claim-filing minimum',
  'incident_claims_management',
  'high',
  'The Carmack Amendment prohibits a carrier from setting a claim-filing period of less than 9 months or a civil-action period of less than 2 years from written claim disallowance. The BOL and company claims policy must mirror these minimums; shipper claims filed within the window must be accepted and processed.',
  ARRAY['cargo claim','damage claim','shortage claim','loss claim','concealed damage','claim filed','claim letter','9 months','Carmack','past the deadline'],
  '(a) Company BOL/contract attempts to limit claim filing to less than 9 months, OR (b) a shipper/consignee claim received within 9 months of delivery is rejected solely on timeliness grounds, OR (c) civil-action window stated on BOL is less than 2 years from written disallowance.',
  '49 USC 14706(e)(1) (Carmack Amendment)',
  'Validate BOL language matches statutory minimums; open a cargo claim file; trigger CLAIMRESP-001 acknowledgment clock; route to Claims Manager.',
  'Claims → Legal → Operations',
  ARRAY['CLAIMRESP-001','CLAIMDOC-001','ICM-DENY-001','SUB-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- CLAIMRESP-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'CLAIMRESP-001',
  '30-day acknowledgment and 120-day disposition',
  'incident_claims_management',
  'high',
  'Under 49 CFR Part 370, the carrier must acknowledge a cargo claim in writing within 30 days and must pay, decline, or make a firm compromise offer in writing within 120 days. If disposition is not possible in 120 days, the carrier must notify the claimant of status at the 120-day mark and every 60 days thereafter.',
  ARRAY['claim acknowledgment','status update','claim pending','still investigating','waiting on carrier','no response','370.9','120 days','60-day status letter'],
  '(a) Written acknowledgment not sent within 30 days of claim receipt, OR (b) no pay/decline/compromise disposition within 120 days AND no 120-day status letter issued, OR (c) no 60-day interval status letter after the initial 120 days while the claim remains open.',
  '49 CFR 370.5 (acknowledgment); 49 CFR 370.9 (disposition)',
  'Generate acknowledgment within 5 business days of claim receipt; calendar 120-day and 60-day status triggers; auto-draft status letters from claim file data.',
  'Claims → Director of Claims → Legal',
  ARRAY['CARGOCLAIM-001','CLAIMDOC-001','ICM-DENY-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- CLAIMDOC-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'CLAIMDOC-001',
  'Cargo claim documentation standard',
  'incident_claims_management',
  'medium',
  'A defensible cargo claim file requires BOL with noted exceptions, delivery receipt, multi-angle damage photos, temperature recorder download for refrigerated freight, and repair/replacement/salvage invoices. Missing documentation weakens both defense and subrogation recovery.',
  ARRAY['temp excursion','reefer download','temp recorder','BOL exception','noted damage','clear delivery','OS&D','overage shortage damage','salvage value','repair invoice'],
  'Cargo claim file missing any of: (a) signed BOL with exception notations, (b) delivery receipt, (c) photos of damaged freight at time of discovery, (d) reefer download / temp-trace chart for refrigerated loads, (e) invoice/commercial value documentation, (f) salvage offer or disposition record, (g) repair estimate if applicable.',
  '49 CFR 370.3 (filing requirements); 49 CFR 370.11 (claimant documentation); industry best practice',
  'Pull reefer temp history from Samsara/ORBCOMM/TempuTech; request BOL + delivery receipt from dispatch within 24 hours; obtain salvage bids before disposition.',
  'Claims → Dispatch → Operations',
  ARRAY['CARGOCLAIM-001','CLAIMRESP-001','ICM-DENY-001','SUB-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- ICM-DENY-001 (renamed from DENY-001 — collides with broker_customer_relations DENY-001)
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'ICM-DENY-001',
  'Valid cargo claim denial basis',
  'incident_claims_management',
  'medium',
  'A carrier may decline a Carmack claim only on one of the five common-law defenses: Act of God, act of public enemy, act of the shipper, act of public authority, or inherent vice of the goods — plus improper packaging, where the defect was not reasonably discoverable at pickup. Declines must be in writing with specific basis cited.',
  ARRAY['denied claim','declining claim','inherent vice','improper packing','shipper load and count','SLC','Act of God','hurricane','flood','spoiled in transit','already damaged'],
  'Cargo claim denied for a reason outside the five Carmack defenses or without supporting evidence (e.g., driver statement, BOL exceptions, photos of pre-existing damage, packaging photos); OR denial letter does not state specific basis in writing.',
  '49 USC 14706; Missouri Pacific R.R. v. Elmore & Stahl (377 U.S. 134) — common-law defense framework; 49 CFR 370.9',
  'Require denial letter to cite specific Carmack defense with supporting documents attached; legal review of any denial >$25,000.',
  'Claims → Legal → Director of Claims',
  ARRAY['CARGOCLAIM-001','CLAIMRESP-001','CLAIMDOC-001','SUB-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- SUB-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'SUB-001',
  'Subrogation pursuit against at-fault third parties',
  'incident_claims_management',
  'medium',
  'When damage or loss is caused by a third party (e.g., another motorist, warehouse, dray carrier, repair facility), the insurer — or the carrier if self-insured on deductible — must pursue subrogation to recover paid losses. Evidence preservation and timely tender to the at-fault carrier are essential.',
  ARRAY['subrogation','at-fault driver','third party','recover from','tender to their carrier','going after','file against','other party''s insurance'],
  'A paid claim (cargo or auto) with an identified at-fault third party and no subrogation demand letter tendered within 90 days of payment, OR evidence (dashcam, photos, police report) not preserved for subrogation counsel.',
  'Common-law subrogation doctrine; insurance policy subrogation clauses; state comparative-fault statutes',
  'Open subrogation file at time of payment; tender demand letter with evidence package within 60 days; track recovery against deductible reimbursement.',
  'Claims → Insurance carrier subrogation unit → Legal',
  ARRAY['ICM-DENY-001','INVEST-001','ICM-DASH-001','LITHOLD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- ICM-THEFT-001 (renamed from THEFT-001 — collides with load_cargo_operations THEFT-001)
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'ICM-THEFT-001',
  'Cargo theft reporting within 24 hours',
  'incident_claims_management',
  'critical',
  'Cargo theft triggers parallel reporting to local law enforcement, the FBI if the load crossed state lines, CargoNet, and the insurance carrier. Fast reporting is the strongest predictor of load recovery — CargoNet data shows recovery rates drop sharply after 24 hours.',
  ARRAY['load stolen','cargo stolen','truck stolen','trailer stolen','truck hijacked','missing trailer','yard theft','empty when we got there','driver robbed','gun pulled','load disappeared','never delivered'],
  'Within 24 hours of theft discovery, any of: (a) no local police report filed with case number, (b) no FBI notification for interstate cargo theft (18 USC 659), (c) no CargoNet alert submitted, (d) no insurance FNOL, (e) no internal trailer-ID / GPS ping history preserved.',
  '18 USC 659 (theft from interstate shipment — federal jurisdiction); CargoNet reporting protocol; insurance policy requirements',
  'File local police report immediately; submit CargoNet theft alert within 24 hours; notify FBI field office for interstate loads; pull Samsara/ELD last-known position; issue BOLO with tractor/trailer numbers and cargo description.',
  'Safety → Security → Claims → Insurance → Law enforcement (local + FBI)',
  ARRAY['CARGONET-001','RPT-001','LITHOLD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- CARGONET-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'CARGONET-001',
  'Hot-spot vigilance and fictitious-pickup defense',
  'incident_claims_management',
  'high',
  'Per CargoNet 2024 and 2025 annual reports, California (Los Angeles, Kern, San Joaquin, Ontario/San Bernardino), Texas (Dallas-Fort Worth, Laredo), Illinois (Cook, Will), Georgia (Atlanta), and Florida (Miami-Dade) account for the majority of U.S. cargo theft. Strategic theft — fictitious pickups, identity theft of legitimate carriers, and double-brokering scams — rose sharply in 2024-2025. Loads tendered in these metros require heightened identity verification at pickup.',
  ARRAY['fictitious pickup','double brokered','identity theft carrier','strategic theft','wrong carrier showed up','MC number mismatch','driver ID fake','Ontario','Laredo','Will County','Miami-Dade','Kern County','San Joaquin','load planner flagged'],
  'Load tendered in a CargoNet top-10 metro with a value >$100,000 AND pickup occurred without: (a) driver license photo verification matched to dispatched driver, (b) tractor/trailer VIN and plate match to fleet record, (c) live phone verification of driver with their dispatcher, (d) shipper confirmation of expected carrier MC number, OR any red flag (MC mismatch, unscheduled team driver, last-minute driver swap, paperwork anomalies) ignored.',
  'CargoNet 2024 Annual Report (Jan 2025); CargoNet 2025 Annual Report (Jan 2026); 18 USC 659; 49 USC 14916 (unlawful brokerage)',
  'Require photo-ID + VIN + MC verification checklist at shipper; call shipper-of-record to confirm correct MC; verify driver against dispatched assignment in TMS before seal break; escalate any anomaly to Security before release.',
  'Dispatch → Security → Safety → Operations → Claims (if theft)',
  ARRAY['ICM-THEFT-001','RPT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- OSHA-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'OSHA-001',
  'OSHA fatality and severe-injury reporting',
  'incident_claims_management',
  'critical',
  'Work-related employee fatalities must be reported to OSHA within 8 hours; in-patient hospitalization, amputation, or loss of an eye within 24 hours. A motor-vehicle accident on a public street/highway (outside a construction work zone) is carved out of §1904.39 reporting, but must still be recorded on the OSHA 300 log. Trucking (NAICS 484) is not on the Appendix A partial-exemption list, so carriers with >10 employees must maintain the 300 log, 300A summary, and 301 incident report.',
  ARRAY['OSHA report','OSHA 300','300A','301','recordable injury','hospitalized','amputation','lost an eye','in-patient','driver injured in yard','dock injury','forklift hit driver','loader injury'],
  '(a) Employee fatality not reported to OSHA within 8 hours (except §1904.39(b)(3) public-highway carve-out), OR (b) employee in-patient hospitalization, amputation, or loss of eye within 24 hours of the incident not reported within 24 hours, OR (c) recordable injury/illness not entered on OSHA 300 log within 7 calendar days, OR (d) 300A summary not posted Feb 1 – Apr 30.',
  '29 CFR 1904.39(a)(1)-(2); 29 CFR 1904.39(b)(3); 29 CFR 1904.1; 29 CFR 1904.7; 29 CFR 1904.32',
  'Call OSHA at 1-800-321-OSHA or use the online reporting portal within the applicable window; open OSHA 300/301 entry; confirm 300A will be posted and electronically submitted by March 2.',
  'Safety → HR → Ownership → Legal',
  ARRAY['FATAL-001','ICM-WC-001','ACC-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- SPILL-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'SPILL-001',
  'Hazmat, fuel, and environmental spill reporting',
  'incident_claims_management',
  'critical',
  'Hazmat incidents meeting §171.15 triggers require telephonic notice to the National Response Center (1-800-424-8802) as soon as practical but within 12 hours, and a written DOT Form 5800.1 within 30 days under §171.16. Diesel and other petroleum spills are excluded from CERCLA 40 CFR 302.4 RQ, but any discharge to navigable waters causing a sheen must be reported immediately to the NRC under the Clean Water Act sheen rule (40 CFR 110.3). HAZWOPER (29 CFR 1910.120) governs cleanup worker qualifications.',
  ARRAY['spill','diesel leak','fuel leak','saddle tank','hazmat release','placarded','UN number','NRC','1-800-424-8802','sheen','storm drain','ditch','creek','river','5800.1','PHMSA report'],
  'Any of: (a) §171.15 trigger met (fatality, hospitalization, >$50K damage, 1-hr evacuation, 1-hr closure of major artery, Class 7 or 6.2 event, ≥450 L/400 kg marine pollutant) and NRC not notified within 12 hours, OR (b) DOT Form 5800.1 not submitted within 30 days of discovery, OR (c) petroleum sheen on navigable waters not reported to NRC immediately, OR (d) cleanup performed by personnel without 29 CFR 1910.120 HAZWOPER training.',
  '49 CFR 171.15; 49 CFR 171.16 (Form F 5800.1); 40 CFR 110.3 (sheen rule); 40 CFR 112 (SPCC, >1,000 gal); 29 CFR 1910.120 (HAZWOPER); state environmental agency statutes',
  'Call NRC 1-800-424-8802 immediately for any sheen or §171.15 trigger; deploy only HAZWOPER-trained responders; file Form 5800.1 via PHMSA online portal within 30 days; notify state environmental agency per state law.',
  'Driver → Safety → Environmental consultant → Ownership → Insurance → PHMSA/NRC/EPA/state agency',
  ARRAY['ICM-ROLL-001','ACC-001','REG-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- NUCLEAR-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'NUCLEAR-001',
  'Nuclear-verdict risk escalation',
  'incident_claims_management',
  'critical',
  'ATRI defines a "nuclear verdict" as a jury award exceeding $10 million in commercial motor vehicle litigation. ATRI research shows mean verdicts over $1M grew from $2.3M (2010) to $22.3M (2018) and the median nuclear verdict reached ~$36M in 2022. Any accident with a fatality, catastrophic injury, multi-vehicle involvement, or plaintiff-bar-favored venue (FL, CA, TX, PA, NJ, GA) requires immediate legal escalation and aggressive evidence preservation.',
  ARRAY['lawsuit served','demand letter','plaintiff attorney','policy limits demand','reptile theory','wrongful death','catastrophic injury','TBI','paraplegic','spoliation letter','preservation letter','Morgan & Morgan','hired a lawyer'],
  'Any one of: (a) fatality or catastrophic injury (paralysis, amputation, TBI, severe burns) and outside defense counsel not retained within 48 hours, OR (b) demand letter or preservation letter received and no litigation hold issued within 24 hours, OR (c) multi-plaintiff claim in a nuclear-verdict-favorable venue without reserve review by insurance carrier.',
  'ATRI "Understanding the Impact of Nuclear Verdicts" (2020, updated 2025); ATRI Top Industry Issues 2024 (lawsuit abuse reform #2 for motor carriers); U.S. Chamber Institute for Legal Reform trucking verdicts research',
  'Retain outside trucking defense counsel immediately; issue litigation hold (LITHOLD-001); preserve dashcam/ELD (ICM-DASH-001); notify excess insurers; freeze social-media posting by driver/employees.',
  'Safety → Ownership → Legal → Primary & excess insurance carriers',
  ARRAY['FATAL-001','LITHOLD-001','ICM-DASH-001','INVEST-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- LITHOLD-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'LITHOLD-001',
  'Litigation hold and evidence preservation',
  'incident_claims_management',
  'critical',
  'Once litigation is reasonably anticipated — serious injury, fatality, preservation letter, demand, or subpoena — the carrier must issue a written litigation hold to all custodians (driver, dispatch, safety, IT/telematics, maintenance, HR) directing them to preserve dashcam, ELD, GPS, text messages, emails, Slack/Telegram messages, DVIRs, maintenance records, and driver qualification file. Spoliation can result in adverse-inference jury instructions and sanctions.',
  ARRAY['litigation hold','legal hold','preservation letter','spoliation','subpoena','deposition','discovery request','demand letter','don''t delete','hold on evidence'],
  'Reasonable anticipation of litigation (fatality, catastrophic injury, preservation letter, demand, served suit) and any of: (a) written litigation-hold memo not issued to all custodians within 24 hours, (b) auto-delete/overwrite not suspended on dashcam, telematics, email, Telegram, (c) driver texts/messages not preserved, (d) DQ file / maintenance file not sequestered.',
  'FRCP 37(e) (spoliation of ESI); common-law duty to preserve; Zubulake v. UBS Warburg line of cases',
  'Issue written hold memo identifying custodians and categories of evidence; suspend overwrite on Lytx/Samsara/Motive; export ELD/GPS/dashcam to immutable storage; instruct all custodians in writing; log distribution.',
  'Legal → Safety → IT → HR → All identified custodians',
  ARRAY['ICM-DASH-001','INVEST-001','NUCLEAR-001','FATAL-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- ICM-COACH-001 (renamed from COACH-001 — collides with driver_safety_behavior COACH-001)
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'ICM-COACH-001',
  'Post-incident driver coaching, preventability, and DataQs CPDP',
  'incident_claims_management',
  'high',
  'Every recordable accident requires documented remedial coaching in the driver''s DQ file and a preventable/non-preventable classification affecting the CSA Crash Indicator BASIC. The FMCSA Crash Preventability Determination Program (CPDP) — expanded to 21 eligible crash types on December 1, 2024 — allows the carrier to submit a DataQs Request for Data Review up to 5 years from the crash date to remove not-preventable crashes from SMS scoring.',
  ARRAY['coaching','remedial training','DQ file','preventable','non-preventable','CSA','Crash Indicator','DataQs','RDR','request for data review','CPDP','preventability review'],
  'Any of: (a) post-incident coaching/retraining not completed and documented in DQ file within 30 days, (b) preventable/non-preventable classification not entered by Safety within 30 days, (c) CPDP-eligible crash (one of 21 types, crash date on/after Aug 1, 2019) not reviewed and submitted via DataQs when facts support non-preventability, (d) DataQs submission attempted beyond the 5-year-from-crash window.',
  '49 CFR 391.25 (annual driver review); FMCSA Crash Preventability Determination Program (permanent May 2020; expanded to 21 crash types December 1, 2024); FMCSA DataQs program — 5-year submission window from crash date',
  'Complete coaching within 30 days with written lesson plan; enter preventability decision in safety system; pull Police Accident Report + dashcam; if CPDP-eligible, submit Request for Data Review via DataQs with PAR, photos, dashcam, and (for fatal crashes) drug/alcohol test results.',
  'Safety → Director of Safety → Compliance → FMCSA DataQs',
  ARRAY['ACC-001','ICM-DASH-001','INVEST-001','REG-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- ICM-WC-001 (renamed from WC-001 — collides with financial_accounting_operations WC-001)
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'ICM-WC-001',
  'Workers'' compensation First Report of Injury',
  'incident_claims_management',
  'high',
  'Driver and non-driver employee injuries trigger state-specific Workers'' Compensation First Report of Injury (FROI) filing deadlines, typically 3-10 days from employer knowledge. Nationwide carriers must track each state''s FROI deadline based on the employee''s state of hire and the state of injury. Early return-to-work programs reduce indemnity cost and restricted-duty days.',
  ARRAY['injured on duty','hurt at work','work comp','workers comp','WC claim','FROI','first report of injury','light duty','modified duty','return to work','MMI','maximum medical improvement'],
  '(a) Employee injury not reported to WC carrier within the state-specific FROI deadline (e.g., CA 5 days, TX 8 days, IL/OH/PA 7 days, FL 7 days), OR (b) no OSHA 300/301 entry within 7 days, OR (c) return-to-work / modified-duty offer not evaluated within 14 days of release to restricted duty, OR (d) suspected fraud not flagged for SIU review.',
  'State workers'' compensation statutes (varies by state); 29 CFR 1904.7 (OSHA recordkeeping parallel); ADA/FMLA interaction',
  'Submit FROI to state WC carrier within the applicable state deadline; open OSHA 301 incident report; initiate return-to-work evaluation with medical provider; coordinate with HR/FMLA if >3 lost days.',
  'Safety → HR → WC Carrier → Risk Manager → Legal (if litigated)',
  ARRAY['OSHA-001','FRAUD-001','ACC-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- FRAUD-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FRAUD-001',
  'Fraudulent claim detection',
  'incident_claims_management',
  'high',
  'Staged accidents, exaggerated injuries, pre-existing-condition fraud, and fictitious cargo claims are rising. Red flags include multiple prior claims at the same address, "swoop and squat" maneuvers on dashcam, sudden attorney representation with same medical-provider pipeline, social media contradicting injury claims, and cargo claimants with no verified shipper-of-record relationship.',
  ARRAY['staged accident','swoop and squat','brake check','sudden stop','same attorney','same clinic','claimant on Facebook','no prior treatment','pre-existing','inflated','exaggerated','suspicious claim','SIU referral'],
  'Any two or more of: (a) dashcam shows intentional brake-check or staged maneuver, (b) claimant + attorney + clinic triad matches prior known fraud ring, (c) claimed injuries inconsistent with collision kinematics / delta-V, (d) claimant has ≥3 prior similar claims, (e) pre-existing MRI/records contradict claim, (f) cargo claim lacks verifiable BOL / shipper-of-record, (g) social media evidence contradicts claimed impairment.',
  'State insurance fraud statutes; 18 USC 1347 (federal health care fraud, staged-accident schemes); NICB fraud indicators; insurance carrier SIU protocols',
  'Refer to insurer Special Investigations Unit (SIU); preserve dashcam + telematics (ICM-DASH-001); run claimant history via ISO ClaimSearch; hold claim payment pending SIU review; report confirmed fraud to state fraud bureau and NICB.',
  'Claims → SIU → Legal → State insurance fraud bureau → NICB → Law enforcement',
  ARRAY['ICM-DASH-001','ICM-WC-001','CLAIMDOC-001','ICM-DENY-001','LITHOLD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- ============================================================
-- Domain 10: Industry-Specific Red Flags & Fraud Patterns
-- 25 rules
-- Collision resolved: DBROKER-001 renamed to IRF-DBROKER-001
--   (rule_id DBROKER-001 already exists in broker_customer_relations domain)
-- All related_rules references to DBROKER-001 within Domain 10
--   updated to IRF-DBROKER-001.
-- ============================================================

-- IRF-DBROKER-001 (renamed from DBROKER-001 — collides with broker_customer_relations rule)
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'IRF-DBROKER-001',
  'Dormant MC suddenly reactivated',
  'industry_red_flags_fraud',
  'critical',
  'A broker or carrier MC number that has been inactive for 6 or more months suddenly shows active status and begins posting or booking loads. This is a classic double-brokering and identity-theft pattern where fraudsters resurrect dormant authorities to evade carrier vetting databases. Per TIA 2024 advisories, roughly 40% of double-brokering fraud originates from MCs reactivated within the prior 90 days.',
  ARRAY['new broker we haven''t used','MC just came active','first load with this MC','SAFER shows recent reactivation','authority reinstated','not on Carrier411 yet','no review history','rate too good to be true'],
  'MC authority shows "inactive" status on FMCSA SAFER for >=180 consecutive days followed by reactivation within the last 30 days AND first load booking occurs within 14 days of reactivation AND the entity has zero Carrier411/RMIS/Ansonia review history.',
  'FMCSA SAFER + L&I system; TIA Fraud Prevention Playbook 2024',
  'Freeze load acceptance. Pull SAFER snapshot, L&I insurance history, and Carrier411/Highway vetting report. Require broker to provide a W-9, certificate of insurance verified directly with the insurer (not the broker), and two prior-shipper references contacted on independently verified numbers before releasing the load.',
  'dispatch -> safety -> operations -> ownership',
  ARRAY['DBROKER-002','DBROKER-003','FAKEMC-001','NEWAUTH-001','MISREP-001','CLAIM-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- DBROKER-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DBROKER-002',
  'MC hop pattern across short window',
  'industry_red_flags_fraud',
  'critical',
  'Same individual contact, phone, or email is associated with 2+ different MC numbers within a 90-day window. This "MC hopping" pattern is used by fraud rings to rotate through authorities as each gets flagged. Per FMCSA advisory notices 2024, MC hopping is now the fastest-growing double-brokering vector.',
  ARRAY['same dispatcher different MC','same email different company','broker changed company name again','phone matches old broker','this guy had another MC','MC different than last week','same rep new letterhead'],
  'Same phone number, email domain, or named individual appears on >=2 distinct MC numbers within a rolling 90-day window, OR a rate confirmation arrives from a different MC than the prior load from the same contact within 60 days.',
  'FMCSA advisory notices 2024; TIA Fraud Prevention Playbook 2024',
  'Do not book. Cross-reference contact data against internal broker master list and Highway/Carrier411 negative reports. Report the pattern to TIA Watchdog and CargoNet. Add phone/email to internal blocklist.',
  'dispatch -> safety -> operations -> ownership -> legal',
  ARRAY['IRF-DBROKER-001','DBROKER-003','SPOOF-001','NEWAUTH-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- DBROKER-003
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'DBROKER-003',
  'Unauthorized re-brokering on active load',
  'industry_red_flags_fraud',
  'critical',
  'Our truck is under dispatch on a load, but paperwork at shipper or receiver shows a different broker, different carrier name, or different rate than our rate confirmation. The original booking entity re-brokered the load without authorization, often to pocket the margin and leave our carrier exposed on payment and liability.',
  ARRAY['BOL doesn''t match rate con','shipper has different carrier listed','broker name on BOL is not ours','different MC on paperwork','receiver says we weren''t scheduled','rate on BOL is lower','load was re-brokered'],
  'Any mismatch between the carrier name/MC on the rate confirmation and the carrier name/MC on the BOL or shipper-gate paperwork, OR rate on shipper-side paperwork deviates by >10% from the signed rate confirmation.',
  'FMCSA 49 CFR §371.3 recordkeeping; TIA Code of Ethics; TIA Fraud Prevention Playbook 2024',
  'Instruct driver to photograph all paperwork before leaving shipper. Do not sign BOL with altered carrier info. Notify original broker in writing and demand signed re-brokering disclosure. File complaint with FMCSA National Consumer Complaint Database and notify factoring company immediately to prevent payment diversion.',
  'dispatch -> operations -> ownership -> accounting -> legal',
  ARRAY['IRF-DBROKER-001','DBROKER-002','MISREP-001','FACTFRAUD-001','BROKERPAY-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- IDTHEFT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'IDTHEFT-001',
  'Carrier identity impersonation booking',
  'industry_red_flags_fraud',
  'critical',
  'A third party books a load using our stolen MC number, DOT number, or certificate of insurance, then either steals the load or leaves us holding claims. CargoNet reports identity-theft-based strategic cargo theft rose 430% from 2022 to 2024.',
  ARRAY['broker says we booked a load we didn''t','shipper expecting our truck but we have nothing dispatched','strange carrier packet request','COI request from unknown broker','someone using our MC','call asking about load we never took'],
  'Inbound communication references a load tender, pickup appointment, or rate confirmation that does not exist in our dispatch/TMS system AND the counterparty claims to have our signed carrier packet or COI on file.',
  'CargoNet 2024 Supply Chain Risk Report; FBI Cargo Theft Unit; NICB 2024',
  'Immediately email and call the broker to confirm no load is dispatched under our MC. Rotate and re-issue carrier packet credentials. File identity theft report with FMCSA, FBI IC3, and CargoNet. Notify insurance carrier and all active brokers via blast email.',
  'dispatch -> safety -> ownership -> legal -> law_enforcement',
  ARRAY['FAKEMC-001','SPOOF-001','FICPICK-001','MISREP-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- FAKEMC-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FAKEMC-001',
  'Unverifiable or fabricated MC number',
  'industry_red_flags_fraud',
  'critical',
  'A broker or carrier offers an MC number that cannot be verified on FMCSA SAFER or L&I, has mismatched legal name vs. DBA, or shows "Not Authorized" status. This is the single most common entry point for freight fraud.',
  ARRAY['MC not on SAFER','FMCSA says not authorized','L&I shows no insurance','legal name doesn''t match','broker says SAFER is wrong','can''t find MC in Highway','DOT number invalid'],
  'MC or DOT number returns "Not Found", "Not Authorized", "Out-of-Service", or missing BOC-3/insurance filing on FMCSA SAFER/L&I, OR legal name on SAFER does not match the name on the rate confirmation.',
  'FMCSA SAFER; FMCSA L&I; 49 CFR §392.9a',
  'Reject the load. Do not accept any rate confirmation or dispatch paperwork until MC is verified active on both SAFER and L&I with matching legal name, active property broker or carrier authority, and valid BMC-84/BMC-85 bond or cargo/liability insurance on file.',
  'dispatch -> safety -> operations -> ownership',
  ARRAY['IDTHEFT-001','SPOOF-001','NEWAUTH-001','IRF-DBROKER-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- SPOOF-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'SPOOF-001',
  'Look-alike email domain impersonation',
  'industry_red_flags_fraud',
  'critical',
  'Email arrives from a domain that visually mimics a known broker (e.g., dispatchcompany-ltd.com vs. genuine dispatchcompany.com, or .co vs. .com, added hyphens, swapped characters). Per FBI IC3 2024, domain-spoofing BEC is the #1 freight-fraud payment-diversion vector.',
  ARRAY['broker email looks different','domain has a dash now','reply came from new address','different email than last load','looks like typo in domain','email came from gmail not company','bank info update email'],
  'Inbound email domain differs from the stored, verified broker domain by any character addition, substitution, TLD change, or subdomain insertion, OR WHOIS registration date of the sending domain is <90 days old AND email requests any payment, banking, or routing change.',
  'FBI IC3 2024 Report; AICPA BEC Advisory; TIA Fraud Prevention Playbook',
  'Do not reply. Do not click links or open attachments. Independently call the broker on the phone number stored in our TMS (not any number in the suspicious email). Report to FBI IC3 and quarantine the email. Rotate accounting email passwords if any link was clicked.',
  'accounting -> operations -> ownership -> legal',
  ARRAY['BEC-001','IDTHEFT-001','DBROKER-002','FACTFRAUD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- HOTSPOT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'HOTSPOT-001',
  'High-risk California theft corridor exposure',
  'industry_red_flags_fraud',
  'high',
  'Load is transiting, staging, or dropping in Ontario, Los Angeles, Fontana, or the Inland Empire — the #1 ranked cargo theft geography in the US per CargoNet 2024, accounting for approximately 30% of all reported US cargo theft events.',
  ARRAY['drop yard in Ontario','Fontana layover','LA warehouse','staging in IE','overnight in Inland Empire','Fontana truck stop','Ontario drop and hook'],
  'Load pickup, drop, or driver rest stop is scheduled within San Bernardino County, Riverside County, or Los Angeles County AND commodity is on the CargoNet Top-10 target list AND the trailer will sit unattended for >2 hours.',
  'CargoNet 2024 Supply Chain Risk Report; NICB 2024 Cargo Theft Data',
  'Require team drivers or escort for high-value loads. No unattended drops. Use only CargoNet-rated secure yards. Install covert GPS on trailer. Driver must park only at Class-A fuel stops with active security. Notify customer of hotspot routing in writing.',
  'dispatch -> safety -> operations',
  ARRAY['HOTSPOT-002','COMMOD-001','STRAT-001','FICPICK-001','THEFT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- HOTSPOT-002
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'HOTSPOT-002',
  'Texas Laredo border theft corridor',
  'industry_red_flags_fraud',
  'high',
  'Load transits Dallas-Fort Worth metroplex, Houston, or the Laredo border zone. Laredo and DFW combined ranked #2 in CargoNet 2024 for cargo theft, with Laredo specializing in cross-border fictitious pickup and strategic theft.',
  ARRAY['Laredo crossing','DFW drop','Houston yard','border broker','Pharr TX','south Texas reefer load','Laredo pickup'],
  'Load origin, destination, or intermediate stop is within Dallas, Tarrant, Harris, or Webb County AND commodity is electronics, food/beverage, or metals AND pickup is within 48 hours of a weekend or federal holiday.',
  'CargoNet 2024; FBI Cargo Theft Unit Southwest Region Bulletin',
  'Verify receiver identity at pickup via photo ID and call-back to shipper. Require live GPS ping every 15 minutes through the corridor. No Friday-afternoon pickups that would stage over the weekend. Confirm the actual tractor DOT number matches the dispatched unit before release.',
  'dispatch -> safety -> operations',
  ARRAY['HOTSPOT-001','FICPICK-001','STRAT-001','COMMOD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- COMMOD-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'COMMOD-001',
  'High-theft-target commodity dispatched',
  'industry_red_flags_fraud',
  'high',
  'Load commodity falls in CargoNet''s top-five targets: food and beverage (#1 by count, ~22% of 2024 events), electronics, personal care/cosmetics, non-ferrous metals, or pharmaceuticals. Tobacco and alcohol also trigger. These commodities require elevated security posture regardless of lane.',
  ARRAY['load is TVs','reefer load of meat','cosmetics trailer','copper load','pharma shipment','cigarettes load','liquor load','laptops pickup'],
  'BOL or rate confirmation commodity description contains any of: electronics/TV/phone/laptop, food/beverage/meat/seafood/nuts, cosmetics/personal care, copper/aluminum/brass, pharmaceuticals/Rx, tobacco/cigarettes, or alcohol/spirits/beer/wine, AND load value exceeds $100,000.',
  'CargoNet 2024 Supply Chain Risk Report; NICB 2024',
  'Flag in TMS as "high-target." Require sealed trailer at pickup with seal number logged. No driver drops at non-secured locations. Verify receiver appointment before departure. Confirm insurance cargo limit is sufficient for declared value.',
  'dispatch -> safety -> operations',
  ARRAY['HOTSPOT-001','HOTSPOT-002','STRAT-001','FICPICK-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- FICPICK-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FICPICK-001',
  'Fictitious pickup by impostor driver',
  'industry_red_flags_fraud',
  'critical',
  'A driver arrives at shipper with forged BOL and carrier paperwork, presents themselves as the dispatched carrier, picks up the load, and disappears. Fictitious pickup is now the fastest-growing strategic theft method per CargoNet, up over 1,400% since 2021.',
  ARRAY['shipper says truck already picked up','different truck showed up','driver not ours arrived first','imposter at pickup','load disappeared at origin','unknown tractor took load','truck took load we didn''t dispatch'],
  'Shipper reports that the load has been picked up but our dispatched driver has not yet arrived, OR the tractor DOT number/trailer number/driver name at the shipper gate does not match our dispatch record, OR the driver at pickup cannot produce matching rate confirmation and photo ID.',
  'CargoNet 2024; FBI Cargo Theft Unit; NICB 2024',
  'Driver must present photo ID, CDL, and rate confirmation at shipper gate. Shipper must verify tractor DOT number against our dispatch message. If mismatch: stop release, lock the gate, call 911, notify CargoNet hotline (1-888-595-CARGO), and freeze the load. Pull shipper security camera footage immediately.',
  'dispatch -> safety -> ownership -> law_enforcement',
  ARRAY['IDTHEFT-001','HOTSPOT-001','HOTSPOT-002','STRAT-001','VINSWAP-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- STRAT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'STRAT-001',
  'Weekend or staged-breakdown strategic theft',
  'industry_red_flags_fraud',
  'high',
  'Load is staged unattended over a weekend, a driver reports a breakdown at a known theft hotspot, or a multi-stop schedule includes a decoy drop. These patterns align with the three dominant strategic-theft methods identified by CargoNet 2024: weekend theft, staged disablement, and decoy-stop diversion.',
  ARRAY['truck broke down at Ontario','parked Friday night til Monday','driver says engine won''t start','unexpected breakdown at TA','trailer sat over weekend','new drop added last minute','breakdown in known hotspot'],
  'Load is scheduled to sit with a drop trailer between 17:00 Friday and 06:00 Monday local time, OR a breakdown is reported within 25 miles of a CargoNet-designated hotspot within 4 hours of pickup, OR a non-original multi-stop instruction arrives after dispatch.',
  'CargoNet 2024; FBI Cargo Theft Unit',
  'Prohibit weekend drop-and-hook for high-value loads. Any reported breakdown: require driver photo of the disablement, verify location, dispatch own roadside (not broker-selected), and push live GPS ping every 5 minutes. Reject any in-transit routing change not signed by original broker via verified email.',
  'dispatch -> safety -> operations -> ownership -> law_enforcement',
  ARRAY['HOTSPOT-001','HOTSPOT-002','FICPICK-001','COLLUDE-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- LOADSCAM-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'LOADSCAM-001',
  'Load board bait posting above market',
  'industry_red_flags_fraud',
  'high',
  'Load board posting offers a rate 10-20% above DAT/Truckstop market average for the lane, combined with urgency language, cash-on-delivery terms, email-only communication, or refusal of phone verification. Classic bait-posting to harvest carrier packets or execute double-brokering.',
  ARRAY['rate too good to be true','urgent load need cover now','must cover in next hour','COD payment','email only please','broker won''t answer phone','rate way above DAT','need carrier packet ASAP'],
  'Posted line-haul rate exceeds DAT 7-day lane average by >=15% AND any one of: broker has <6 months MC, broker refuses phone verification, broker demands carrier packet before negotiation, or broker uses free-email domain (gmail/yahoo/outlook).',
  'TIA Fraud Prevention Playbook 2024; DAT Freight & Analytics fraud bulletin',
  'Do not send carrier packet, COI, or W-9 until broker is verified on Highway or Carrier411 with >=10 positive reviews and >=12 months authority. Always call the broker on the phone number listed on SAFER, not the one on the posting. Screenshot the posting and report to the load board fraud desk.',
  'dispatch -> operations -> ownership',
  ARRAY['NEWAUTH-001','IRF-DBROKER-001','FAKEMC-001','SPOOF-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- FUELFRAUD-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FUELFRAUD-001',
  'Fuel card skimming and anomalous use',
  'industry_red_flags_fraud',
  'high',
  'Fuel card is compromised via pump skimmer or internal fraud, producing transactions at unusual MCC codes, off-route locations, large non-fuel amounts, or simultaneous multi-location use. NICB and FBI data indicate skimming-related fuel card fraud losses exceeded $100M industry-wide in 2024.',
  ARRAY['charge we didn''t make','card used in another state','two swipes same time','big non-fuel charge','MCC not fuel','card declined unusual','skimmer alert from bank','fuel card compromised'],
  'Any one of: single transaction >$750 on non-fuel MCC, two transactions >100 miles apart within 60 minutes on the same card, transaction >50 miles off the driver''s dispatched route, OR cumulative daily non-fuel spend >$200 per card.',
  'NICB 2024 Fuel Card Fraud Bulletin; FBI Financial Crimes Section; Industry Best Practice (Comdata/EFS/WEX advisories)',
  'Immediately freeze the card. Pull last 30 days of transactions and geotag each against ELD position. Issue replacement card with new PIN. If skimmer suspected, report to the fuel network (Comdata/EFS/WEX) fraud desk and FBI IC3. If internal: see FUELTHEFT-001.',
  'accounting -> safety -> operations -> ownership',
  ARRAY['FUELTHEFT-001','COLLUDE-001','VINSWAP-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- PAYDISC-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'PAYDISC-001',
  'Driver pay discrepancy and phantom mileage',
  'industry_red_flags_fraud',
  'medium',
  'Driver submits pay dispute claiming underpayment, unpaid detention, or missed stops, but settlement, ELD, and BOL data contradict the claim. May indicate phishing of driver, check fraud, duplicate submission, or deliberate phantom-miles claim. Per AICPA 2024, payroll misrepresentation represents ~9% of occupational fraud cases.',
  ARRAY['driver says not paid but settlement shows paid','duplicate pay request','phantom miles claim','detention with no docs','paystub looks altered','driver disputing same load twice','claims miles but ELD shows less'],
  'Driver-claimed miles exceed PC*Miler practical miles by >=5%, OR detention claim >2 hours submitted without timestamped shipper/receiver signatures, OR the same load number appears on >=2 pay requests from the same driver, OR driver reports unpaid settlement that shows cleared in accounting within the prior 14 days.',
  'AICPA Occupational Fraud 2024; Industry Best Practice (DOL FLSA recordkeeping)',
  'Pull ELD position history, BOL timestamps, and PC*Miler route for the disputed load. If driver claims unpaid but settlement shows paid, verify driver''s bank account of record has not been changed in the last 30 days (possible phishing). Require documentary proof (photos, signed BOL) for all detention claims >2 hours.',
  'accounting -> safety -> operations',
  ARRAY['COLLUDE-001','ELDFRAUD-001','CARGOSHORT-001','BEC-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- COLLUDE-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'COLLUDE-001',
  'Driver collusion with outside party',
  'industry_red_flags_fraud',
  'critical',
  'Driver behavior patterns indicate coordination with an outside thief or accomplice: unplanned route deviation, unscheduled stops at unauthorized locations, unexplained communication blackouts near a hotspot, or a "breakdown" that conveniently aligns with a prior-location contact. Strategic collusion is present in roughly 18% of cargo theft cases per CargoNet 2024.',
  ARRAY['driver off route','phone off near hotspot','unscheduled stop 2 hours','driver took different exit','ELD shows long idle off route','driver not answering dispatch','breakdown in known hotspot area'],
  'Any two of: route deviation >25 miles from dispatched path, communication silence >90 minutes during active dispatch, unscheduled stop >60 minutes at non-approved location, OR ELD idle >45 minutes within 10 miles of a CargoNet theft hotspot, occurring on the same load.',
  'CargoNet 2024; FBI Cargo Theft Unit',
  'Immediately establish live contact with driver on cell and in-cab. Require photo of current location. Escalate to safety manager. If contact cannot be re-established within 30 minutes, treat as potential theft in progress: notify CargoNet, local law enforcement, insurance carrier, and broker. Preserve ELD and ELog data.',
  'dispatch -> safety -> operations -> ownership -> law_enforcement',
  ARRAY['STRAT-001','FICPICK-001','ELDFRAUD-001','FUELTHEFT-001','CARGOSHORT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- ELDFRAUD-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'ELDFRAUD-001',
  'Falsified ELD logs via third-party editing',
  'industry_red_flags_fraud',
  'high',
  'ELD log edits are submitted through a third-party (not the driver or safety officer), or log annotations show systematic reclassification of driving to on-duty-not-driving. Violates 49 CFR §395.32 and may indicate collusion, HOS cheating, or coverup of theft-related idle time.',
  ARRAY['log edit from outside','driver says dispatcher edited logs','on-duty switched to off-duty after the fact','unassigned driving miles','log annotations don''t match','HOS violation hidden','third party login to ELD'],
  'ELD shows >=3 edits per week per driver from a non-driver/non-safety account, OR >30 minutes of unassigned driving per week, OR any edit that reclassifies driving time to off-duty after the fact without a supporting annotation.',
  '49 CFR §395.32; FMCSA ELD Rule; FMCSA Compliance Review guidance',
  'Freeze log edits pending safety audit. Pull last 60 days of ELD edit logs and identify all edit-source user IDs. Restrict edit privileges to safety manager only. If collusion pattern confirmed, report to FMCSA and initiate internal investigation. Correlate edits with suspected theft or fuel-fraud incidents.',
  'safety -> operations -> ownership -> legal',
  ARRAY['COLLUDE-001','FUELTHEFT-001','CARGOSHORT-001','PAYDISC-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- FUELTHEFT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FUELTHEFT-001',
  'Driver fuel diversion to personal vehicle',
  'industry_red_flags_fraud',
  'high',
  'Driver uses company fuel card to fuel a personal vehicle or sells fuel for cash. Detected via gallons-pumped exceeding tank capacity, fueling events inconsistent with ELD position or engine-off status, or repeat small-volume transactions in tight windows.',
  ARRAY['fueled more gallons than tank holds','two fuel stops same hour','fueled with engine off per ELD','driver pumped into pickup','MPG dropped suddenly','fuel at odd hour off route','driver reported fuel short'],
  'Single fuel transaction >= (tractor tank capacity x 1.05), OR >=2 fuel transactions on same card within 60 minutes, OR fueling event recorded while ELD shows engine off >10 minutes prior and >10 minutes after, OR fleet-wide MPG drop >15% for a specific driver over 30 days with no equipment change.',
  'NICB 2024; Industry Best Practice (Comdata/WEX fraud controls)',
  'Suspend fuel card. Pull video from fuel island if available. Compare last 60 days of fuel transactions to ELD position and engine-hours data. Interview driver with safety manager present. If confirmed: terminate per policy, recover loss via bond or final settlement, and file theft report.',
  'accounting -> safety -> operations -> ownership -> law_enforcement',
  ARRAY['FUELFRAUD-001','COLLUDE-001','ELDFRAUD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- CARGOSHORT-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'CARGOSHORT-001',
  'Cargo shortage or driver pilferage',
  'industry_red_flags_fraud',
  'high',
  'Receiver reports cargo short at delivery — pieces missing, seal broken, or weight variance — on a load where the driver had sole custody. Pattern indicates driver pilferage or collusion, particularly when repeated across loads for the same driver.',
  ARRAY['receiver says load is short','seal broken at delivery','weight doesn''t match BOL','pallet missing','driver says seal fell off','same driver third short this quarter','product missing after delivery'],
  'Any of: seal number at delivery does not match seal number at pickup, piece count variance >0, weight variance >2% on a sealed load, OR a single driver has >=2 shortage claims in a rolling 90-day window.',
  'Carmack Amendment 49 USC §14706; CargoNet 2024; Industry Best Practice',
  'Photograph seal and trailer interior at every pickup and delivery. If seal mismatch or shortage: do not sign clear BOL, note exception, and photograph. Pull ELD for unscheduled stops. Hold settlement on the driver pending investigation. File cargo claim with insurance and preserve all chain-of-custody records.',
  'dispatch -> safety -> operations -> ownership -> legal',
  ARRAY['COLLUDE-001','ELDFRAUD-001','STRAT-001','CLAIM-001','THEFT-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- BROKERPAY-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'BROKERPAY-001',
  'Broker non-payment aging past 60/90 days',
  'industry_red_flags_fraud',
  'high',
  'Broker invoice is past 60 or 90 days unpaid with repeated excuses ("awaiting shipper payment," "accounting cycle," "invoice lost"), partial payments with disputes raised after delivery, or broker contact goes silent. TIA reports non-payment complaints doubled from 2022 to 2024.',
  ARRAY['invoice not paid 90 days','broker won''t return calls','awaiting shipper excuse again','partial payment with dispute','broker went dark','can''t reach dispatcher','broker MC just went inactive','phone disconnected'],
  'Invoice aging >60 days with >=2 unkept payment promises, OR >90 days with any outstanding balance, OR broker has made any partial payment while disputing previously-agreed rate confirmation terms, OR broker MC status changes to inactive while balance is owed.',
  'TIA Fraud Prevention Playbook 2024; FMCSA 49 CFR §371.3; Industry Best Practice (Ansonia, RMIS credit reports)',
  'Stop further loads with this broker immediately. Send formal demand letter via email and certified mail. Check BMC-84/BMC-85 broker bond and prepare claim against surety (bond claims must often be filed within 12 months). Report non-payment to Ansonia, RMIS, Carrier411, and TIA Watchdog. Engage collection counsel if >$10,000.',
  'accounting -> operations -> ownership -> legal',
  ARRAY['IRF-DBROKER-001','DBROKER-003','MISREP-001','FACTFRAUD-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- MISREP-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'MISREP-001',
  'Carrier-of-record misrepresentation trap',
  'industry_red_flags_fraud',
  'critical',
  'Broker lists our MC as carrier of record on a load actually being hauled by a different, uninsured, or unvetted carrier — or conversely, fails to list us while we''re hauling. Creates a vicarious liability trap: in a crash, plaintiffs pursue our policy even though we had no control over the equipment or driver.',
  ARRAY['we''re listed as carrier but didn''t haul','broker used our MC for another truck','COI request but we have no load','shipper thinks we took it but we didn''t','our name on BOL we never saw','insurance asking about load we didn''t run'],
  'Any inbound inquiry (shipper, broker, insurance adjuster, attorney) references a load dispatched under our MC/DOT that does not exist in our TMS, OR our COI is attached to a rate confirmation we never signed, OR BOL bears our name on a load we did not physically haul.',
  'FMCSA 49 CFR §371.3; TIA Code of Ethics; Schramm v. Foster line of case law on broker vicarious liability',
  'Send cease-and-desist in writing to the broker demanding removal of our MC from all documentation. Notify our liability insurer immediately to preserve coverage posture. File complaint with FMCSA National Consumer Complaint Database. Audit last 90 days of outbound COIs for any issued to this broker.',
  'operations -> ownership -> legal -> accounting',
  ARRAY['IDTHEFT-001','DBROKER-003','FAKEMC-001','NEWAUTH-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- NEWAUTH-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'NEWAUTH-001',
  'Newly issued authority high-risk profile',
  'industry_red_flags_fraud',
  'high',
  'Counterparty broker or carrier has an MC issued <6 months ago, no review history on Carrier411/RMIS/Ansonia, is based in a fraud-hub state (FL, CA, TX border counties), has a phone number matching flagged databases, or uses an email domain registered <90 days ago. Aggregate of these markers is a TIA-defined elevated-risk profile.',
  ARRAY['new broker we haven''t used','no review history','MC issued this year','Miami broker new MC','FL authority brand new','email domain new','phone on Carrier411 blocklist','first time broker'],
  'Counterparty MC issued <180 days ago AND any one of: zero reviews across Carrier411/RMIS/Ansonia/Highway, principal address in FL/CA/Laredo-TX counties, email domain WHOIS <90 days old, or phone appears in Carrier411 or Highway fraud-flag list.',
  'TIA Fraud Prevention Playbook 2024; FMCSA SAFER; Highway and Carrier411 vetting standards',
  'Require additional verification: W-9, broker authority letter, BMC-84/BMC-85 bond confirmation from the surety directly, two signed references from prior carriers verified by phone. Set credit limit to $0 (cash or quick-pay only) until 90 days of payment history is established. Do not release carrier packet until verification complete.',
  'dispatch -> operations -> ownership',
  ARRAY['IRF-DBROKER-001','FAKEMC-001','LOADSCAM-001','SPOOF-001','BROKERPAY-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- BEC-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'BEC-001',
  'Business email compromise payment redirection',
  'industry_red_flags_fraud',
  'critical',
  'Email requesting change in payment instructions, "updated banking info," urgent wire transfer, or routing change — with urgency, secrecy, or out-of-band pressure. FBI IC3 2024 reports BEC losses exceeded $2.9B across US sectors; freight BEC rose 55% year-over-year.',
  ARRAY['please change payment info','bank info update','new ACH instructions','urgent wire transfer','CEO says send now','don''t call just email','updated remittance address','new routing number from broker'],
  'Any email requesting change of banking, ACH, wire, or remittance information AND any one of: sender domain differs from stored domain, email requests secrecy or urgency, request arrives outside normal business hours, or request bypasses the vendor''s established AP process.',
  'FBI IC3 2024 Report; AICPA BEC Advisory; US Treasury FinCEN Advisory FIN-2022-A003',
  'NEVER change banking information from an email alone. Call the vendor/broker on the phone number already stored in our accounting system (not any number in the suspect email). Require a signed change form. Dual-approval by a second manager for any banking change. Report the email to FBI IC3 and quarantine. If funds already sent, contact bank within 72 hours to attempt FinCEN Financial Fraud Kill Chain recall.',
  'accounting -> ownership -> legal -> law_enforcement',
  ARRAY['SPOOF-001','FACTFRAUD-001','GHOSTVEND-001','BROKERPAY-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- FACTFRAUD-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'FACTFRAUD-001',
  'Factoring fraud and double-factoring',
  'industry_red_flags_fraud',
  'critical',
  'Shipper pays a factor-assigned invoice to the wrong party, a carrier factors invoices for loads not actually delivered, or the same invoice is factored at two companies simultaneously. Per TIA 2024, double-factoring is a rising scheme tied to double-brokering rings.',
  ARRAY['customer paid wrong party','invoice factored twice','NOA not honored','factor says invoice already sold','two factors claim same load','payment to old factor not new one','invoice without POD'],
  'Notice of Assignment (NOA) on file but payment received by original carrier bank account, OR any invoice submitted to factor without matching POD and signed BOL, OR same invoice number appears in >=2 factoring company systems for the same load.',
  'TIA Fraud Prevention Playbook 2024; UCC Article 9 (assignment of accounts); Industry Best Practice (IFA International Factoring Association)',
  'Require POD + signed BOL before releasing any invoice to the factor. Re-send NOA to shipper on every first invoice and re-confirm bank routing quarterly. If payment misdirection detected, contact shipper AP in writing and reference NOA on file. For suspected double-factoring, notify both factors immediately and preserve all documents — UCC priority rules apply.',
  'accounting -> operations -> ownership -> legal',
  ARRAY['BROKERPAY-001','DBROKER-003','BEC-001','MISREP-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- GHOSTVEND-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'GHOSTVEND-001',
  'Ghost vendor invoice scheme',
  'industry_red_flags_fraud',
  'high',
  'Invoices arrive from vendors with no delivery history, round-dollar amounts, sequential invoice numbering across months, or vendor address matching an employee''s home address. Per AICPA 2024 Report to the Nations, billing schemes are the most common asset misappropriation fraud in transportation, median loss $100,000.',
  ARRAY['vendor we never used','round dollar invoice','address matches employee home','invoice numbers in sequence','no PO on invoice','vendor not in system','same PO box as driver'],
  'Any of: vendor has zero prior delivery/service events in TMS or AP history, invoice amount ends in .00 AND exceeds $500, invoice numbers from same vendor are sequential across monthly submissions (indicates sole-customer vendor), vendor remit address matches any employee address in HR records, OR no PO or receiving document exists.',
  'AICPA Occupational Fraud 2024 Report to the Nations; FBI IC3 2024; Industry Best Practice (SOX AP controls adapted for private fleets)',
  'Hold invoice. Run vendor address against employee master and driver records. Require PO, receiving document, and approving manager name for every invoice >$500. Quarterly: pull top 20 vendors by spend and verify each against a physical presence check (website, D-U-N-S, tax ID). Rotate AP approvers.',
  'accounting -> ownership -> legal',
  ARRAY['BEC-001','FACTFRAUD-001','PAYDISC-001'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;

-- VINSWAP-001
INSERT INTO knowledge_base_rules (rule_id, title, domain, severity, description, detection_signals, violation_criteria, regulatory_source, recommended_action, escalation_path, related_rules, is_template)
VALUES (
  'VINSWAP-001',
  'Tractor identity swap and plate fraud',
  'industry_red_flags_fraud',
  'critical',
  'A tractor arriving at shipper or appearing at inspection has an altered VIN, DOT number plate from a different truck, swapped license plate, or mismatched registration. Pattern signals either stolen tractor re-tagged for fictitious pickup or carrier-identity cloning, both linked to strategic cargo theft per NICB 2024.',
  ARRAY['DOT number doesn''t match truck','VIN looks tampered','plate from different state than registration','truck VIN mismatch','different truck arrived','DOT sticker doesn''t match cab','registration doesn''t match VIN'],
  'Any of: VIN plate shows physical alteration, repainting, or re-rivet marks; DOT number displayed on door does not match the tractor''s registered DOT in SAFER; license plate state does not match registration state without a valid IRP reason; tractor unit number in our fleet roster does not match the unit at the shipper.',
  'NICB 2024 Vehicle Theft Bulletin; FMCSA 49 CFR §390.21 (DOT marking); CargoNet 2024',
  'Shipper must verify VIN, DOT, and plate match before release. If mismatch: do not release load, notify law enforcement, photograph all identifiers, and call NICB (1-800-TEL-NICB). If our own tractor is suspected stolen and re-tagged, file police report, notify insurer, and flag VIN in NICB and NCIC databases.',
  'dispatch -> safety -> ownership -> law_enforcement',
  ARRAY['FICPICK-001','IDTHEFT-001','HOTSPOT-001','HOTSPOT-002'],
  FALSE
) ON CONFLICT (rule_id) DO NOTHING;
