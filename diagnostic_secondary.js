const { createClient } = require('@supabase/supabase-js');

const supabaseSecondary = createClient(
    'https://zobnskexzcermtpgqfjq.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvYm5za2V4emNlcm10cGdxZmpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODAxMDEwNiwiZXhwIjoyMDczNTg2MTA2fQ.FR8fIFC6EV3Js4xI-Cob4VxVFE1fhFFawHdxuUbX-5E'
);

async function testInsert() {
    console.log('--- Test Insert without id_comunidad ---');

    const testData = {
        nombre_cliente: 'TEST USER',
        apellid_cliente: 'DIAGNOSTIC',
        mail: 'test@example.com',
        telefono: '123456789',
        direccion_postal: 'Calle Test 123',
        contestacion: true,
        comunidad: 'TEST COMMUNITY',
        codigo_comunidad: '000TEST'
        // id_comunidad: OMITTED
    };

    const { data, error } = await supabaseSecondary
        .from('propietarios')
        .insert([testData])
        .select();

    if (error) {
        console.error('Insert failed:', error);
    } else {
        console.log('Insert successful:', data);

        // Clean up
        const { error: errorD } = await supabaseSecondary
            .from('propietarios')
            .delete()
            .eq('id', data[0].id);
        console.log('Cleanup successful');
    }
}

testInsert();
