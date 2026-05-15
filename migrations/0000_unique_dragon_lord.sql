CREATE TABLE "account_movements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar NOT NULL,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reservation_id" varchar,
	"reservation_code" text,
	"guest_name" text,
	"reference" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text NOT NULL,
	"nivel" integer DEFAULT 1,
	"activo" boolean DEFAULT true,
	CONSTRAINT "accounting_accounts_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "accounting_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero_minuta" integer NOT NULL,
	"fecha" date NOT NULL,
	"periodo" text NOT NULL,
	"concepto" text NOT NULL,
	"tipo_origen" text NOT NULL,
	"origen_id" integer,
	"origen_tipo" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "accounting_entry_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"comprobante_tipo" text,
	"comprobante_numero" text,
	"proveedor_nombre" text,
	"debe" numeric(14, 2) DEFAULT '0',
	"haber" numeric(14, 2) DEFAULT '0'
);
--> statement-breakpoint
CREATE TABLE "accounting_suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"razon_social" text NOT NULL,
	"cuit" text NOT NULL,
	"domicilio" text,
	"localidad" text,
	"provincia" text DEFAULT 'Entre Rios',
	"cp" text,
	"condicion_iva" text NOT NULL,
	"alicuota_iibb" numeric(6, 4) DEFAULT '0',
	"alicuota_ganancias" numeric(6, 4) DEFAULT '0',
	"alicuota_iva" numeric(6, 4) DEFAULT '0',
	"cbu" text,
	"banco" text,
	"activo" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "accounting_suppliers_cuit_unique" UNIQUE("cuit")
);
--> statement-breakpoint
CREATE TABLE "admin_cash_arqueos" (
	"id" serial PRIMARY KEY NOT NULL,
	"fecha" date NOT NULL,
	"saldo_sistema" numeric(14, 2) NOT NULL,
	"saldo_fisico" numeric(14, 2) NOT NULL,
	"diferencia" numeric(14, 2) NOT NULL,
	"observaciones" text,
	"operador" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "admin_cash_arqueos_fecha_unique" UNIQUE("fecha")
);
--> statement-breakpoint
CREATE TABLE "admin_cash_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"fondo_fijo" numeric(14, 2) DEFAULT '0',
	"alerta_bajo" numeric(14, 2) DEFAULT '0',
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "admin_cash_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"fecha" date NOT NULL,
	"hora" text,
	"tipo" text NOT NULL,
	"concepto" text NOT NULL,
	"importe" numeric(14, 2) NOT NULL,
	"signo" text NOT NULL,
	"cuenta_contable_id" integer,
	"centro_costo" text,
	"payment_order_id" integer,
	"area_origen" text,
	"cierre_origen_id" integer,
	"anulado" boolean DEFAULT false,
	"motivo_anulacion" text,
	"operador" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agencies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"razon_social" text NOT NULL,
	"nombre_fantasia" text,
	"direccion" text,
	"pais" text DEFAULT 'Argentina',
	"codigo_postal" text,
	"localidad" text,
	"provincia" text,
	"telefono" text,
	"email" text,
	"cuil_cuit" text NOT NULL,
	"numero_fiscal" text,
	"condicion_iva" text DEFAULT 'responsable_inscripto',
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"commission_rate" numeric(5, 2) DEFAULT '0',
	"credit_limit" numeric(12, 2) DEFAULT '0',
	"payment_term_days" integer DEFAULT 30,
	"notes" text,
	"is_active" text DEFAULT 'true',
	"created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"user_name" text,
	"action" text NOT NULL,
	"module" text NOT NULL,
	"entity_type" text,
	"entity_id" varchar,
	"description" text NOT NULL,
	"details" text,
	"ip_address" text,
	"timestamp" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bed_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "bed_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "billing_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"modo_arca" boolean DEFAULT false,
	"cuit" text DEFAULT '33-68110008-9',
	"razon_social" text DEFAULT 'MARAN S.A.',
	"domicilio_comercial" text DEFAULT 'Alameda de la Federación 698',
	"localidad" text DEFAULT 'Paraná',
	"provincia" text DEFAULT 'Entre Ríos',
	"cp" text DEFAULT '3100',
	"condicion_iva" text DEFAULT 'Responsable Inscripto',
	"inicio_actividades" text DEFAULT '01/01/2000',
	"punto_venta" integer DEFAULT 1,
	"tipo_punto_venta" text DEFAULT 'online',
	"arca_cert" text,
	"arca_key" text,
	"arca_cuit" text,
	"logo_url" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cancelled_reservation_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_code" text NOT NULL,
	"guest_name" text NOT NULL,
	"room_number" text NOT NULL,
	"check_in_date" date NOT NULL,
	"check_out_date" date NOT NULL,
	"cancellation_date" timestamp NOT NULL,
	"cancelled_by" varchar,
	"reason" text,
	"reservation_id" varchar,
	"total_amount" text
);
--> statement-breakpoint
CREATE TABLE "cash_closing_summaries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" varchar NOT NULL,
	"area" text NOT NULL,
	"total_cash" numeric(10, 2) DEFAULT '0',
	"total_debit_card" numeric(10, 2) DEFAULT '0',
	"total_credit_card" numeric(10, 2) DEFAULT '0',
	"total_transfer" numeric(10, 2) DEFAULT '0',
	"total_mercadopago" numeric(10, 2) DEFAULT '0',
	"total_current_account" numeric(10, 2) DEFAULT '0',
	"total_room_charge" numeric(10, 2) DEFAULT '0',
	"total_general" numeric(10, 2) DEFAULT '0',
	"transaction_count" integer DEFAULT 0,
	"closed_at" timestamp DEFAULT now(),
	"closed_by" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" varchar,
	"area" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" varchar,
	"source_label" text,
	"payment_method" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"movement_type" text DEFAULT 'income' NOT NULL,
	"receipt_type" text,
	"registered_by" text,
	"created_at" timestamp DEFAULT now(),
	"anulado" boolean DEFAULT false NOT NULL,
	"motivo_anulacion" text,
	"anulado_por" text,
	"anulado_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cash_register_configs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area" text NOT NULL,
	"area_label" text NOT NULL,
	"shifts_per_day" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "cash_register_configs_area_unique" UNIQUE("area")
);
--> statement-breakpoint
CREATE TABLE "cash_shifts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area" text NOT NULL,
	"shift_number" integer NOT NULL,
	"opened_by" text,
	"closed_by" text,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"auto_creado" boolean DEFAULT false,
	"turno_anterior_id" varchar
);
--> statement-breakpoint
CREATE TABLE "charges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" varchar NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"date" date NOT NULL,
	"category" text DEFAULT 'otros' NOT NULL,
	"created_by" varchar,
	"status" text DEFAULT 'active' NOT NULL,
	"anulado_por" text,
	"motivo_anulacion" text,
	"anulado_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"razon_social" text NOT NULL,
	"nombre_fantasia" text,
	"direccion" text,
	"pais" text DEFAULT 'Argentina',
	"codigo_postal" text,
	"localidad" text,
	"provincia" text,
	"telefono" text,
	"email" text,
	"cuil_cuit" text NOT NULL,
	"numero_fiscal" text,
	"condicion_iva" text DEFAULT 'responsable_inscripto',
	"inscripcion_nacional" text,
	"inscripcion_provincial" text,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"credit_limit" numeric(12, 2) DEFAULT '0',
	"payment_term_days" integer DEFAULT 30,
	"notes" text,
	"is_active" text DEFAULT 'true',
	"created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "email_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"global_enabled" boolean DEFAULT false NOT NULL,
	"provider" text DEFAULT 'resend' NOT NULL,
	"api_key" text,
	"from_email" text DEFAULT 'reservas@maransuites.com' NOT NULL,
	"from_name" text DEFAULT 'Maran Suites & Towers' NOT NULL,
	"google_maps_url" text,
	"smtp_host" text DEFAULT 'smtp.gmail.com',
	"smtp_port" integer DEFAULT 587,
	"smtp_user" text,
	"smtp_pass" text,
	"smtp_secure" boolean DEFAULT false,
	"confirmation_enabled" boolean DEFAULT true NOT NULL,
	"confirmation_subject" text DEFAULT 'Confirmación de tu reserva — Maran Suites & Towers' NOT NULL,
	"confirmation_body" text DEFAULT 'Hola {nombre_huesped},

Tu reserva ha sido confirmada. Te esperamos el {fecha_checkin} en la habitación {numero_habitacion}.

Check-in: {fecha_checkin}
Check-out: {fecha_checkout}
Habitaciones: {numero_habitacion}

¡Nos vemos pronto!
Maran Suites & Towers' NOT NULL,
	"reminder_enabled" boolean DEFAULT true NOT NULL,
	"reminder_subject" text DEFAULT 'Tu estadía se acerca — Maran Suites & Towers' NOT NULL,
	"reminder_body" text DEFAULT 'Hola {nombre_huesped},

Te recordamos que en 2 días comenzás tu estadía en Maran Suites & Towers.

Check-in: {fecha_checkin}
Check-out: {fecha_checkout}
Habitación: {numero_habitacion}

¡Te esperamos!
Maran Suites & Towers' NOT NULL,
	"checkout_enabled" boolean DEFAULT true NOT NULL,
	"checkout_subject" text DEFAULT 'Gracias por tu estadía — Contanos tu experiencia' NOT NULL,
	"checkout_body" text DEFAULT 'Hola {nombre_huesped},

Gracias por elegir Maran Suites & Towers. Esperamos que hayas disfrutado tu estadía.

Nos encantaría conocer tu experiencia. Completá nuestra encuesta rápida (menos de 2 minutos):

{link_encuesta}

Si tu estadía fue excelente, también podés dejarnos una reseña en Google Maps:
{link_google_maps}

¡Hasta la próxima!
Maran Suites & Towers' NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" varchar,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"recipient_email" text,
	"error_message" text,
	"sent_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "event_charge_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"default_price" numeric(10, 2),
	"is_active" text DEFAULT 'true',
	CONSTRAINT "event_charge_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "event_charges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"charge_type_id" varchar,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"date" date NOT NULL,
	"notes" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"method" text NOT NULL,
	"is_advance" text DEFAULT 'false',
	"reservation_id" varchar,
	"notes" text,
	"paid_at" timestamp,
	"created_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"motivo_anulacion" text,
	"anulado_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "event_rooms" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"capacity" integer DEFAULT 50 NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"description" text,
	"amenities" text[],
	"is_active" text DEFAULT 'true'
);
--> statement-breakpoint
CREATE TABLE "event_table_charges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_table_id" varchar NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "event_table_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_table_id" varchar NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"method" text NOT NULL,
	"is_advance" text DEFAULT 'false',
	"reservation_id" varchar,
	"receipt_type" text,
	"paid_at" timestamp,
	"created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "event_tables" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"table_number" integer NOT NULL,
	"label" text,
	"seats" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"reservation_id" varchar,
	"receipt_type" text,
	"closed_at" timestamp,
	"created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_code" text NOT NULL,
	"name" text NOT NULL,
	"event_room_id" varchar NOT NULL,
	"event_type" text DEFAULT 'corporate' NOT NULL,
	"contact_name" text NOT NULL,
	"contact_phone" text,
	"contact_email" text,
	"company_id" varchar,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"start_time" text,
	"end_time" text,
	"attendees" integer DEFAULT 10,
	"attendees_adults" integer DEFAULT 0,
	"attendees_youth" integer DEFAULT 0,
	"attendees_children" integer DEFAULT 0,
	"status" text DEFAULT 'tentative' NOT NULL,
	"notes" text,
	"notas_armado" text,
	"notas_cocina" text,
	"notas_mantenimiento" text,
	"notas_housekeeping" text,
	"receipt_type" text,
	"closed_at" timestamp,
	"total_amount" numeric(10, 2),
	"total_paid" numeric(10, 2),
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folio_movements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folio_id" varchar NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"description" text NOT NULL,
	"source_type" text,
	"source_id" varchar,
	"payment_method" text,
	"cash_movement_id" varchar,
	"related_folio_id" varchar,
	"voided_movement_id" varchar,
	"void_reason" text,
	"registered_by" text,
	"receipt_type" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "folios" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"total_charges" numeric(12, 2) DEFAULT '0',
	"total_payments" numeric(12, 2) DEFAULT '0',
	"balance" numeric(12, 2) DEFAULT '0',
	"opened_at" timestamp DEFAULT now(),
	"closed_at" timestamp,
	"closed_by" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "folios_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "group_charges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" varchar NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"date" date NOT NULL,
	"category" text DEFAULT 'otros' NOT NULL,
	"billing_target" text DEFAULT 'group' NOT NULL,
	"reservation_id" varchar,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "group_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" varchar NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"method" text NOT NULL,
	"date" date NOT NULL,
	"reference" text,
	"distribution" text DEFAULT 'equal' NOT NULL,
	"distribution_detail" jsonb,
	"received_by" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "group_reservation_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" varchar NOT NULL,
	"reservation_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_room_blocks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" varchar NOT NULL,
	"room_type_id" varchar NOT NULL,
	"quantity" integer NOT NULL,
	"rate_plan_id" varchar,
	"agreed_rate" numeric(12, 2),
	"block_check_in_date" date,
	"block_check_out_date" date
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_code" text NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"event_date" date,
	"event_salon" text,
	"event_time" text,
	"check_in_date" date NOT NULL,
	"check_out_date" date NOT NULL,
	"status" text DEFAULT 'tentative' NOT NULL,
	"release_date" date,
	"notes" text,
	"color" text DEFAULT '#6366f1',
	"master_folio_config" text DEFAULT 'accommodation',
	"created_at" timestamp NOT NULL,
	"created_by" varchar,
	CONSTRAINT "groups_group_code_unique" UNIQUE("group_code")
);
--> statement-breakpoint
CREATE TABLE "guest_preferences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_id" varchar NOT NULL,
	"category" text NOT NULL,
	"subcategory" text,
	"title" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"visible_to" text[] DEFAULT '{"all"}' NOT NULL,
	"recorded_by" text,
	"source_stay" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guest_reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" varchar,
	"guest_id" varchar NOT NULL,
	"room_id" varchar,
	"review_date" date NOT NULL,
	"source" text DEFAULT 'direct' NOT NULL,
	"rating" integer NOT NULL,
	"title" text,
	"content" text NOT NULL,
	"sentiment" text,
	"sentiment_score" numeric(5, 4),
	"categories" text[],
	"category_scores" text,
	"key_phrases" text[],
	"improvement_suggestions" text[],
	"analyzed_at" timestamp,
	"is_published" text DEFAULT 'false',
	"staff_response" text,
	"responded_at" timestamp,
	"responded_by" text
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"document_type" text,
	"document_number" text,
	"nationality" text,
	"direccion" text,
	"localidad" text,
	"codigo_postal" text,
	"fecha_nacimiento" date,
	"sexo" text DEFAULT 'no_especifica',
	"segment" text DEFAULT 'LEISURE',
	"cuil_cuit" text,
	"company_id" varchar,
	"agency_id" varchar,
	"fecha_alta" timestamp,
	"vehiculo_patente" text,
	"vehiculo_marca" text,
	"vehiculo_modelo" text,
	"vehiculo_color" text,
	CONSTRAINT "guests_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "hospitality_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" varchar NOT NULL,
	"guest_id" varchar NOT NULL,
	"preference_id" varchar,
	"alert_message" text NOT NULL,
	"target_area" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"is_acknowledged" boolean DEFAULT false,
	"acknowledged_at" timestamp,
	"acknowledged_by" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "housekeeping_tasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" varchar NOT NULL,
	"task_type" text DEFAULT 'checkout_clean' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"assigned_to" varchar,
	"notes" text,
	"scheduled_date" date NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"inspected_by" varchar,
	"inspected_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iibb_retentions" (
	"id" serial PRIMARY KEY NOT NULL,
	"nro_constancia" integer NOT NULL,
	"supplier_id" integer,
	"cuit_proveedor" text NOT NULL,
	"fecha_retencion" date NOT NULL,
	"fecha_comprobante" date NOT NULL,
	"nro_comprobante" integer NOT NULL,
	"letra_factura" text,
	"importe_base" numeric(14, 2) NOT NULL,
	"alicuota" numeric(6, 4) NOT NULL,
	"importe_retenido" numeric(14, 2) NOT NULL,
	"anulacion" boolean DEFAULT false,
	"conv_multilateral" boolean DEFAULT false,
	"invoice_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text,
	"name" text NOT NULL,
	"description" text,
	"category_id" varchar,
	"supplier_id" varchar,
	"unit" text DEFAULT 'unidad' NOT NULL,
	"cost_price" numeric(10, 2) DEFAULT '0',
	"min_stock" numeric(10, 3) DEFAULT '0',
	"max_stock" numeric(10, 3),
	"current_stock" numeric(10, 3) DEFAULT '0',
	"location" text,
	"is_active" text DEFAULT 'true',
	CONSTRAINT "inventory_items_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "inventory_warehouses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"area" text DEFAULT 'general' NOT NULL,
	"is_active" text DEFAULT 'true',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoice_counters" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo_comprobante" text NOT NULL,
	"punto_venta" integer NOT NULL,
	"ultimo_numero" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "item_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" varchar,
	"area" text DEFAULT 'general' NOT NULL,
	"is_active" text DEFAULT 'true'
);
--> statement-breakpoint
CREATE TABLE "item_price_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"recorded_at" timestamp DEFAULT now(),
	"source" text DEFAULT 'manual',
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "lost_found_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'otro' NOT NULL,
	"location" text NOT NULL,
	"found_date" date NOT NULL,
	"found_by" text NOT NULL,
	"storage_location" text,
	"status" text DEFAULT 'en_custodia' NOT NULL,
	"guest_id" varchar,
	"reservation_id" varchar,
	"notes" text,
	"claimed_by" text,
	"claimed_date" date,
	"delivery_type" text,
	"delivered_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "lost_found_items_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "maintenance_blocks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" varchar,
	"room_id" varchar NOT NULL,
	"block_from" date NOT NULL,
	"block_to" date NOT NULL,
	"blocked_by" text NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "maintenance_staff" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"specialty" text,
	"is_active" text DEFAULT 'true'
);
--> statement-breakpoint
CREATE TABLE "menu_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"display_order" integer DEFAULT 0,
	"is_active" text DEFAULT 'true'
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"preparation_time" integer,
	"is_available" text DEFAULT 'true',
	"is_active" text DEFAULT 'true',
	"is_editable" text DEFAULT 'false',
	"allergens" text[],
	"display_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "night_audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_date" date NOT NULL,
	"executed_at" timestamp DEFAULT now() NOT NULL,
	"executed_by" text DEFAULT 'sistema' NOT NULL,
	"is_manual" boolean DEFAULT false NOT NULL,
	"reservations_processed" integer DEFAULT 0 NOT NULL,
	"reservations_skipped" integer DEFAULT 0 NOT NULL,
	"total_posted" numeric(12, 2) DEFAULT '0' NOT NULL,
	"arrivals_next_day" integer DEFAULT 0 NOT NULL,
	"arrivals_with_prepago" integer DEFAULT 0 NOT NULL,
	"arrivals_without_prepago" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'success' NOT NULL,
	"notes" text,
	"detail" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"menu_item_id" varchar NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"course" integer DEFAULT 1,
	"notes" text,
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "order_splits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"split_number" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"method" text,
	"receipt_type" text,
	"is_paid" text DEFAULT 'false',
	"paid_at" timestamp,
	"created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ota_channels" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"channel_type" text NOT NULL,
	"status" text DEFAULT 'inactive' NOT NULL,
	"api_key" text,
	"api_secret" text,
	"hotel_code" text,
	"commission_percent" numeric(5, 2) DEFAULT '15.00',
	"sync_enabled" text DEFAULT 'false' NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ota_reservation_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" varchar NOT NULL,
	"external_reservation_id" text NOT NULL,
	"internal_reservation_id" varchar,
	"guest_name" text NOT NULL,
	"check_in_date" date NOT NULL,
	"check_out_date" date NOT NULL,
	"room_type_name" text,
	"total_amount" numeric(10, 2),
	"commission" numeric(10, 2),
	"net_amount" numeric(10, 2),
	"status" text DEFAULT 'pending' NOT NULL,
	"raw_data" text,
	"synced_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" varchar NOT NULL,
	"item_type" text NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_value" numeric(10, 2)
);
--> statement-breakpoint
CREATE TABLE "package_room_prices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" varchar NOT NULL,
	"room_type_id" varchar NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"extra_amount" numeric(12, 2) DEFAULT '0'
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"room_type_id" varchar,
	"nights" integer DEFAULT 1 NOT NULL,
	"base_price" numeric(12, 2) NOT NULL,
	"discount_percent" numeric(5, 2),
	"valid_from" date,
	"valid_until" date,
	"status" text DEFAULT 'active' NOT NULL,
	"included_services" text[],
	"terms" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "packages_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payment_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_order_id" integer NOT NULL,
	"invoice_id" integer NOT NULL,
	"importe_cancelado" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero" text NOT NULL,
	"supplier_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"forma_pago" text DEFAULT 'transferencia' NOT NULL,
	"dep_bancario" numeric(14, 2) DEFAULT '0',
	"efectivo" numeric(14, 2) DEFAULT '0',
	"cheques" numeric(14, 2) DEFAULT '0',
	"total_facturas" numeric(14, 2) NOT NULL,
	"retencion_iibb" numeric(14, 2) DEFAULT '0',
	"retencion_ganancias" numeric(14, 2) DEFAULT '0',
	"retencion_iva" numeric(14, 2) DEFAULT '0',
	"retencion_prof_libs" numeric(14, 2) DEFAULT '0',
	"compensacion" numeric(14, 2) DEFAULT '0',
	"total_abonado" numeric(14, 2) NOT NULL,
	"asiento_id" integer,
	"observaciones" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "payment_orders_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" varchar NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"method" text NOT NULL,
	"date" date NOT NULL,
	"reference" text,
	"received_by" varchar,
	"notes" text,
	"billing_target" text DEFAULT 'guest',
	"company_id" varchar,
	"agency_id" varchar,
	"status" text DEFAULT 'active' NOT NULL,
	"anulado_por" text,
	"motivo_anulacion" text,
	"anulado_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "planning_day_notes" (
	"date" text PRIMARY KEY NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "presupuesto_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"presupuesto_id" varchar NOT NULL,
	"sector" varchar DEFAULT 'otro' NOT NULL,
	"descripcion" text NOT NULL,
	"detalle" text,
	"cantidad" numeric(8, 2) DEFAULT '1' NOT NULL,
	"precio_unitario" numeric(12, 2) DEFAULT '0' NOT NULL,
	"descuento" numeric(5, 2) DEFAULT '0' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presupuestos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" varchar NOT NULL,
	"para" text NOT NULL,
	"cliente_type" varchar DEFAULT 'libre',
	"cliente_id" varchar,
	"fecha_emision" varchar NOT NULL,
	"fecha_vencimiento" varchar,
	"fecha_evento" varchar,
	"estado" varchar DEFAULT 'borrador' NOT NULL,
	"notas" text,
	"condiciones" text,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"descuento_global" numeric(5, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "purchase_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo_comprobante" text NOT NULL,
	"supplier_id" integer,
	"proveedor_nombre" text,
	"proveedor_cuit" text,
	"punto_venta" text,
	"numero_comprobante" text NOT NULL,
	"numero_comprobante_ext" text,
	"fecha_emision" date NOT NULL,
	"periodo" text,
	"condicion_pago" text DEFAULT 'contado' NOT NULL,
	"monto_neto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"alicuota_iva" text DEFAULT '21',
	"monto_iva27" numeric(14, 2) DEFAULT '0',
	"monto_iva21" numeric(14, 2) DEFAULT '0',
	"monto_iva105" numeric(14, 2) DEFAULT '0',
	"monto_iva5" numeric(14, 2) DEFAULT '0',
	"monto_iva25" numeric(14, 2) DEFAULT '0',
	"monto_exento" numeric(14, 2) DEFAULT '0',
	"monto_no_gravado" numeric(14, 2) DEFAULT '0',
	"impuestos_internos" numeric(14, 2) DEFAULT '0',
	"ley_25413" numeric(14, 2) DEFAULT '0',
	"percepcion_iibb" numeric(14, 2) DEFAULT '0',
	"percepcion_iva" numeric(14, 2) DEFAULT '0',
	"percepcion_ganancias" numeric(14, 2) DEFAULT '0',
	"retencion_iibb" numeric(14, 2) DEFAULT '0',
	"retencion_ganancias" numeric(14, 2) DEFAULT '0',
	"retencion_iva" numeric(14, 2) DEFAULT '0',
	"retencion_suss" numeric(14, 2) DEFAULT '0',
	"retencion_municipal" numeric(14, 2) DEFAULT '0',
	"monotributo_comp_bc" numeric(14, 2) DEFAULT '0',
	"monto_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cuenta_contable_id" integer,
	"centro_costo" text,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"asiento_id" integer,
	"observaciones" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" varchar NOT NULL,
	"item_id" varchar NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost" numeric(10, 2) NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"received_quantity" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"supplier_id" varchar NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0',
	"tax" numeric(12, 2) DEFAULT '0',
	"total" numeric(12, 2) DEFAULT '0',
	"notes" text,
	"created_at" timestamp NOT NULL,
	"expected_date" date,
	"received_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "rate_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"room_type_id" varchar NOT NULL,
	"base_rate" numeric(10, 2) NOT NULL,
	"rate_1pax" numeric(10, 2),
	"rate_2pax" numeric(10, 2),
	"rate_3pax" numeric(10, 2),
	"rate_4pax" numeric(10, 2),
	"currency" text DEFAULT 'ARS' NOT NULL,
	"refundable" text DEFAULT 'true' NOT NULL,
	"cancellation_policy" text,
	"valid_from" date,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" varchar NOT NULL,
	"inventory_item_id" varchar,
	"ingredient_name" text NOT NULL,
	"quantity" numeric(10, 3) NOT NULL,
	"unit" text NOT NULL,
	"unit_cost" numeric(10, 2) DEFAULT '0',
	"warehouse_id" varchar
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" varchar NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "reservation_changelog" (
	"id" serial PRIMARY KEY NOT NULL,
	"reservation_id" varchar NOT NULL,
	"fecha" timestamp DEFAULT now() NOT NULL,
	"operador" text,
	"tipo" text NOT NULL,
	"descripcion" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_companions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" varchar NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"document_type" varchar(20) DEFAULT 'DNI' NOT NULL,
	"document_number" varchar(50),
	"date_of_birth" date,
	"nationality" varchar(100),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_code" text NOT NULL,
	"guest_id" varchar NOT NULL,
	"company_id" varchar,
	"agency_id" varchar,
	"room_type_id" varchar NOT NULL,
	"room_id" varchar NOT NULL,
	"rate_plan_id" varchar,
	"check_in_date" date NOT NULL,
	"check_out_date" date NOT NULL,
	"nights" integer DEFAULT 1 NOT NULL,
	"base_rate_per_night" numeric(10, 2),
	"discount_type" text DEFAULT 'none' NOT NULL,
	"discount_value" numeric(10, 2) DEFAULT '0',
	"final_rate_per_night" numeric(10, 2),
	"total_room_amount" numeric(10, 2),
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text DEFAULT 'directo' NOT NULL,
	"ota_channel_id" varchar,
	"external_reservation_id" text,
	"number_of_guests" integer DEFAULT 1 NOT NULL,
	"bed_type_id" varchar,
	"bed_type_notes" text,
	"early_check_in" boolean DEFAULT false,
	"early_check_in_time" text,
	"early_check_in_charge" numeric(10, 2),
	"late_check_out" boolean DEFAULT false,
	"late_check_out_time" text,
	"late_check_out_charge" numeric(10, 2),
	"notes" text,
	"voucher_code" text,
	"voucher_notes" text,
	"is_upgrade" boolean DEFAULT false,
	"original_room_type_id" varchar,
	"color" text,
	"created_at" timestamp NOT NULL,
	"last_modified_by" varchar
);
--> statement-breakpoint
CREATE TABLE "restaurant_areas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"area_type" text DEFAULT 'indoor' NOT NULL,
	"capacity" integer DEFAULT 20 NOT NULL,
	"has_tables" text DEFAULT 'true',
	"is_active" text DEFAULT 'true',
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "restaurant_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"table_id" varchar,
	"area_id" varchar,
	"reservation_id" varchar,
	"guest_id" varchar,
	"order_type" text DEFAULT 'dine_in' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"covers" integer DEFAULT 1,
	"waiter_name" text,
	"order_label" text,
	"active_course" integer DEFAULT 1,
	"subtotal" numeric(10, 2) DEFAULT '0',
	"tax" numeric(10, 2) DEFAULT '0',
	"total" numeric(10, 2) DEFAULT '0',
	"notes" text,
	"cancellation_reason" text,
	"opened_at" timestamp NOT NULL,
	"closed_at" timestamp,
	"charged_to_room" text DEFAULT 'false',
	"room_number" text,
	"receipt_type" text,
	"payment_method" text
);
--> statement-breakpoint
CREATE TABLE "restaurant_tables" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_number" text NOT NULL,
	"area_id" varchar NOT NULL,
	"capacity" integer DEFAULT 4 NOT NULL,
	"shape" text DEFAULT 'square',
	"status" text DEFAULT 'available' NOT NULL,
	"position_x" integer DEFAULT 0,
	"position_y" integer DEFAULT 0,
	"has_window" text DEFAULT 'false',
	"is_active" text DEFAULT 'true'
);
--> statement-breakpoint
CREATE TABLE "restaurant_time_slots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"time" text NOT NULL,
	"label" text,
	"is_active" text DEFAULT 'true',
	"display_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "room_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"base_occupancy" integer DEFAULT 2 NOT NULL,
	"max_occupancy" integer DEFAULT 4 NOT NULL,
	"public_description" text,
	"amenities" text[],
	"photos" text[],
	"sort_order" integer DEFAULT 0,
	"show_in_booking" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_number" text NOT NULL,
	"room_type_id" varchar NOT NULL,
	"floor" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"bed_config" text,
	"features" text[],
	"max_occupancy" integer DEFAULT 2,
	"notes" text,
	CONSTRAINT "rooms_room_number_unique" UNIQUE("room_number")
);
--> statement-breakpoint
CREATE TABLE "sales_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo_comprobante" text NOT NULL,
	"punto_venta" integer NOT NULL,
	"numero" integer NOT NULL,
	"fecha_emision" date NOT NULL,
	"fecha_vto_pago" date,
	"cliente_razon_social" text NOT NULL,
	"cliente_cuit" text,
	"cliente_dni" text,
	"cliente_condicion_iva" text NOT NULL,
	"cliente_domicilio" text,
	"monto_neto" numeric(14, 2) NOT NULL,
	"monto_iva21" numeric(14, 2) DEFAULT '0',
	"monto_iva105" numeric(14, 2) DEFAULT '0',
	"monto_exento" numeric(14, 2) DEFAULT '0',
	"monto_no_gravado" numeric(14, 2) DEFAULT '0',
	"monto_total" numeric(14, 2) NOT NULL,
	"cae" text,
	"cae_fecha_vto" date,
	"modo_ficticio" boolean DEFAULT true,
	"estado" text DEFAULT 'emitida',
	"reserva_id" integer,
	"folio_id" integer,
	"nota_credito_id" integer,
	"concepto" text DEFAULT '2',
	"items" jsonb,
	"operador" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "spa_account_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"item_type" text DEFAULT 'treatment' NOT NULL,
	"notes" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spa_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" varchar NOT NULL,
	"guest_name" text NOT NULL,
	"reservation_id" varchar,
	"status" text DEFAULT 'open' NOT NULL,
	"subtotal" numeric(10, 2) DEFAULT '0',
	"total" numeric(10, 2) DEFAULT '0',
	"total_paid" numeric(10, 2) DEFAULT '0',
	"receipt_type" text,
	"notes" text,
	"opened_at" timestamp NOT NULL,
	"closed_at" timestamp,
	"closed_by" text,
	"charged_to" text
);
--> statement-breakpoint
CREATE TABLE "spa_appointments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cabin_id" varchar NOT NULL,
	"treatment_id" varchar NOT NULL,
	"professional_id" varchar,
	"guest_name" text NOT NULL,
	"guest_last_name" text,
	"guest_phone" text,
	"guest_email" text,
	"reservation_id" varchar,
	"appointment_date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spa_cabins" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" text DEFAULT 'true'
);
--> statement-breakpoint
CREATE TABLE "spa_clients" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"phone" text,
	"email" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spa_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"method" text NOT NULL,
	"is_advance" text DEFAULT 'false',
	"appointment_id" varchar,
	"reservation_id" varchar,
	"notes" text,
	"created_at" timestamp NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"motivo_anulacion" text,
	"anulado_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "spa_professionals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"last_name" text,
	"is_active" text DEFAULT 'true'
);
--> statement-breakpoint
CREATE TABLE "spa_treatment_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "spa_treatments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"is_active" text DEFAULT 'true'
);
--> statement-breakpoint
CREATE TABLE "stay_notes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" varchar NOT NULL,
	"guest_id" varchar,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"visible_to" text[] DEFAULT '{"all"}' NOT NULL,
	"is_resolved" boolean DEFAULT false,
	"resolved_at" timestamp,
	"resolved_by" text,
	"recorded_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" varchar NOT NULL,
	"movement_type" text NOT NULL,
	"quantity" numeric(10, 3) NOT NULL,
	"previous_stock" numeric(10, 3) NOT NULL,
	"new_stock" numeric(10, 3) NOT NULL,
	"unit_cost" numeric(10, 2),
	"reference" text,
	"notes" text,
	"source_type" text,
	"source_id" varchar,
	"created_at" timestamp NOT NULL,
	"created_by" text,
	"warehouse_id" varchar,
	"to_warehouse_id" varchar
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"email" text,
	"address" text,
	"cuit" text,
	"payment_term_days" integer DEFAULT 30,
	"notes" text,
	"is_active" text DEFAULT 'true'
);
--> statement-breakpoint
CREATE TABLE "survey_responses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_token_id" varchar NOT NULL,
	"rating_overall" integer NOT NULL,
	"rating_room" integer NOT NULL,
	"rating_cleanliness" integer NOT NULL,
	"rating_service" integer NOT NULL,
	"rating_food" integer,
	"comment" text,
	"guest_name" text,
	"submitted_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "survey_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" varchar NOT NULL,
	"token" varchar NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "survey_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "system_incidents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"module" text DEFAULT 'otro' NOT NULL,
	"severity" text DEFAULT 'media' NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"reported_by" text NOT NULL,
	"reported_at" timestamp DEFAULT now() NOT NULL,
	"assigned_to" text,
	"resolved_by" text,
	"resolved_at" timestamp,
	"resolution_notes" text,
	"screenshot_url" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"target_area" text NOT NULL,
	"related_entity_type" text,
	"related_entity_id" text,
	"is_read" boolean DEFAULT false,
	"read_at" timestamp,
	"read_by" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"description" text,
	"updated_at" timestamp NOT NULL,
	"updated_by" text,
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "system_users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"role" text DEFAULT 'reception' NOT NULL,
	"department" text,
	"phone" text,
	"is_active" text DEFAULT 'true',
	"last_login" timestamp,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "system_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "table_reservations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" varchar NOT NULL,
	"guest_name" text NOT NULL,
	"guest_phone" text,
	"guest_email" text,
	"party_size" integer DEFAULT 2 NOT NULL,
	"reservation_date" date NOT NULL,
	"reservation_time" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"advance_amount" numeric(10, 2) DEFAULT '0',
	"advance_method" text,
	"advance_date" date,
	"advance_notes" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treatment_supplies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"treatment_id" varchar NOT NULL,
	"inventory_item_id" varchar NOT NULL,
	"quantity" numeric(10, 3) NOT NULL,
	"unit" text NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"role" text DEFAULT 'reception' NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "warehouse_stock" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"warehouse_id" varchar NOT NULL,
	"item_id" varchar NOT NULL,
	"current_stock" numeric(10, 3) DEFAULT '0',
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "web_checkins" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" varchar NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"confirmed_first_name" text,
	"confirmed_last_name" text,
	"confirmed_document_type" text,
	"confirmed_document_number" text,
	"confirmed_nationality" text,
	"confirmed_phone" text,
	"confirmed_email" text,
	"document_photo_url" text,
	"estimated_arrival_time" text,
	"request_early_check_in" boolean DEFAULT false,
	"early_check_in_time" text,
	"terms_accepted" boolean DEFAULT false,
	"terms_accepted_at" timestamp,
	"ip_address" text,
	"completed_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "web_checkins_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"room_id" varchar,
	"location" text,
	"category" text DEFAULT 'general' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"assigned_to_id" varchar,
	"reported_by" text,
	"reported_at" timestamp NOT NULL,
	"scheduled_date" date,
	"completed_at" timestamp,
	"completed_by" text,
	"estimated_cost" numeric(10, 2),
	"actual_cost" numeric(10, 2),
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "accounting_entry_lines" ADD CONSTRAINT "accounting_entry_lines_entry_id_accounting_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."accounting_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_entry_lines" ADD CONSTRAINT "accounting_entry_lines_account_id_accounting_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounting_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_cash_movements" ADD CONSTRAINT "admin_cash_movements_cuenta_contable_id_accounting_accounts_id_fk" FOREIGN KEY ("cuenta_contable_id") REFERENCES "public"."accounting_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_cash_movements" ADD CONSTRAINT "admin_cash_movements_payment_order_id_payment_orders_id_fk" FOREIGN KEY ("payment_order_id") REFERENCES "public"."payment_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio_movements" ADD CONSTRAINT "folio_movements_folio_id_folios_id_fk" FOREIGN KEY ("folio_id") REFERENCES "public"."folios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iibb_retentions" ADD CONSTRAINT "iibb_retentions_supplier_id_accounting_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."accounting_suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iibb_retentions" ADD CONSTRAINT "iibb_retentions_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_order_items" ADD CONSTRAINT "payment_order_items_payment_order_id_payment_orders_id_fk" FOREIGN KEY ("payment_order_id") REFERENCES "public"."payment_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_order_items" ADD CONSTRAINT "payment_order_items_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_supplier_id_accounting_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."accounting_suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuesto_items" ADD CONSTRAINT "presupuesto_items_presupuesto_id_presupuestos_id_fk" FOREIGN KEY ("presupuesto_id") REFERENCES "public"."presupuestos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_supplier_id_accounting_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."accounting_suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_cuenta_contable_id_accounting_accounts_id_fk" FOREIGN KEY ("cuenta_contable_id") REFERENCES "public"."accounting_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_changelog" ADD CONSTRAINT "reservation_changelog_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_companions" ADD CONSTRAINT "reservation_companions_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_token_id_survey_tokens_id_fk" FOREIGN KEY ("survey_token_id") REFERENCES "public"."survey_tokens"("id") ON DELETE no action ON UPDATE no action;