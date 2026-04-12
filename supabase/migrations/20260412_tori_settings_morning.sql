-- Migration: add morning briefing columns to tori_settings
-- Run this in your Supabase SQL editor

ALTER TABLE tori_settings
  ADD COLUMN IF NOT EXISTS morning_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE tori_settings
  ADD COLUMN IF NOT EXISTS morning_time text NOT NULL DEFAULT '07:00';
