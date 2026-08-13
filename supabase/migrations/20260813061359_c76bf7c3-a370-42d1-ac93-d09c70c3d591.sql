DO $$
DECLARE
  r RECORD;
  v_parent uuid;
  rows_data CONSTANT text[][] := ARRAY[
    ['1','الأصول','asset',''],
    ['11','الأصول المتداولة','asset','1'],
    ['111','النقدية والبنوك','asset','11'],
    ['1111','الصندوق العام','asset','111'],
    ['1112','حساب بنكي رئيسي','asset','111'],
    ['1113','شيكات تحت التحصيل','asset','111'],
    ['112','المدينون','asset','11'],
    ['1121','العملاء','asset','112'],
    ['1122','أوراق القبض','asset','112'],
    ['1123','مدينون آخرون','asset','112'],
    ['1124','مصروفات مدفوعة مقدماً','asset','112'],
    ['1131','مخزون البضاعة','asset','113'],
    ['1132','مخزون قطع الغيار','asset','113'],
    ['12','الأصول الثابتة','asset','1'],
    ['121','الأراضي','asset','12'],
    ['122','المباني','asset','12'],
    ['123','السيارات','asset','12'],
    ['124','الأثاث والتجهيزات','asset','12'],
    ['125','أجهزة الحاسب','asset','12'],
    ['129','مجمع الإهلاك','asset','12'],
    ['2','الالتزامات','liability',''],
    ['21','الالتزامات المتداولة','liability','2'],
    ['211','الموردون','liability','21'],
    ['212','أوراق الدفع','liability','21'],
    ['213','مصروفات مستحقة','liability','21'],
    ['214','ضرائب مستحقة','liability','21'],
    ['215','دائنون آخرون','liability','21'],
    ['22','الالتزامات طويلة الأجل','liability','2'],
    ['221','قروض طويلة الأجل','liability','22'],
    ['3','حقوق الملكية','equity',''],
    ['31','رأس المال','equity','3'],
    ['32','الأرباح المرحلة','equity','3'],
    ['33','جاري الشركاء','equity','3'],
    ['34','المسحوبات الشخصية','equity','3'],
    ['4','الإيرادات','revenue',''],
    ['41','المبيعات','revenue','4'],
    ['411','مبيعات المركز الرئيسي','revenue','41'],
    ['412','مبيعات الفروع','revenue','41'],
    ['413','مبيعات التجزئة','revenue','41'],
    ['42','مردودات ومسموحات المبيعات','revenue','4'],
    ['43','إيرادات أخرى','revenue','4'],
    ['431','إيرادات فوائد','revenue','43'],
    ['432','إيرادات متنوعة','revenue','43'],
    ['5','المصروفات','expense',''],
    ['51','تكلفة المبيعات','expense','5'],
    ['511','المشتريات','expense','51'],
    ['512','مردودات المشتريات','expense','51'],
    ['513','مصاريف شراء ونقل','expense','51'],
    ['57','مصروفات تشغيلية','expense','5'],
    ['571','الرواتب والأجور','expense','57'],
    ['572','الإيجارات','expense','57'],
    ['573','الكهرباء والماء','expense','57'],
    ['574','الاتصالات والإنترنت','expense','57'],
    ['575','الصيانة','expense','57'],
    ['576','نقل وشحن','expense','57'],
    ['577','قرطاسية ومطبوعات','expense','57'],
    ['578','مصروفات متنوعة','expense','57'],
    ['58','مصروفات إدارية وعمومية','expense','5'],
    ['581','الإهلاك','expense','58'],
    ['582','ديون معدومة','expense','58'],
    ['583','أتعاب مهنية','expense','58'],
    ['59','مصروفات تمويلية','expense','5'],
    ['591','فوائد وأعباء قروض','expense','59'],
    ['592','مصروفات بنكية','expense','59']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(rows_data, 1) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.code = rows_data[i][1]) THEN
      INSERT INTO public.accounts (code, name, type, is_active)
      VALUES (rows_data[i][1], rows_data[i][2], rows_data[i][3]::account_type, true);
    END IF;
  END LOOP;

  FOR i IN 1 .. array_length(rows_data, 1) LOOP
    IF rows_data[i][4] <> '' THEN
      SELECT id INTO v_parent FROM public.accounts WHERE code = rows_data[i][4];
      UPDATE public.accounts SET parent_id = v_parent
      WHERE code = rows_data[i][1] AND parent_id IS DISTINCT FROM v_parent;
    END IF;
  END LOOP;

  -- ربط الحسابات الموجودة مسبقاً بالشجرة الجديدة (بدون تغيير أسمائها أو أرصدتها)
  FOR r IN SELECT * FROM (VALUES
      ('113','11'),
      ('13130','111'),
      ('13230','112'),
      ('14130','21'),
      ('1603','41'),
      ('54','51'),
      ('52','51'),
      ('1203','58'),
      ('1303','1'),
      ('1403','2'),
      ('1503','22')
    ) AS v(child, parent)
  LOOP
    SELECT id INTO v_parent FROM public.accounts WHERE code = r.parent;
    UPDATE public.accounts SET parent_id = v_parent WHERE code = r.child AND v_parent IS NOT NULL;
  END LOOP;
END $$;