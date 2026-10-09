const { jsPDF } = window.jspdf;

async function urlToCompressedJPEG(url, maxDim = 1200, quality = 0.7) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const blob = await response.blob();
        const img = await new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = reject;
            im.src = URL.createObjectURL(blob);
        });
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
            const scale = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(img.src);
        return canvas.toDataURL('image/jpeg', quality);
    } catch (err) {
        console.error('Error procesando imagen:', url, err);
        return null;
    }
}

function createPDF(title){
  const doc = new jsPDF();
  doc.setFillColor(15,23,42);
  doc.rect(0,0,210,32,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(18);
  doc.text('AutoPuerta Pro',14,16);
  doc.setFontSize(9);
  doc.text('Gestión de Puertas Automáticas',14,23);
  doc.setFontSize(8);
  doc.text(title,196,16,{align:'right'});
  doc.text(formatDate(new Date().toISOString()),196,23,{align:'right'});
  doc.setTextColor(0,0,0);
  doc.setDrawColor(200,200,200);
  doc.line(14,38,196,38);
  return doc;
}

function addPDFFooter(doc,page){
  const totalPages = doc.internal.getNumberOfPages();
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('AutoPuerta Pro — Documento generado automáticamente',14,doc.internal.pageSize.height-8);
  doc.text('Página '+page+' de '+totalPages,196,doc.internal.pageSize.height-8,{align:'right'});
}

function pdfSectionTitle(doc, texto, y){
  doc.setFillColor(15,23,42);
  doc.rect(14,y,3,6,'F');
  doc.setFontSize(11);
  doc.setTextColor(15,23,42);
  doc.setFont(undefined,'bold');
  doc.text(texto.toUpperCase(),20,y+5);
  doc.setFont(undefined,'normal');
  return y + 11;
}

function pdfBox(doc, x, y, w, h, fillColor){
  doc.setFillColor(fillColor[0],fillColor[1],fillColor[2]);
  doc.setLineWidth(0.6);
  doc.setDrawColor(100,116,139);
  doc.roundedRect(x,y,w,h,3,3,'FD');
}

function pdfField(doc, label, value, x, y){
  doc.setFontSize(7);
  doc.setTextColor(120,130,145);
  doc.text(label.toUpperCase(),x,y);
  doc.setFontSize(10);
  doc.setTextColor(15,23,42);
  doc.text(String(value||'—'),x,y+5.5);
}

const ESTADO_COLOR = {
  abierto: [234,88,12], en_ruta: [37,99,235],
  en_taller: [217,119,6], completado: [22,163,74]
};

// ─── Convertir firma base64 PNG a formato que acepta jsPDF ───
async function firmaToPDF(firmaDataURL){
  if(!firmaDataURL) return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.src = firmaDataURL;
  await new Promise((resolve,reject)=>{
    img.onload = resolve;
    img.onerror = reject;
  });
  // Escalar para que quepa en el espacio del PDF (70mm ancho)
  const maxW = 70;
  const scale = Math.min(maxW / img.width, 25 / img.height, 1);
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // Convertir a JPEG para que jsPDF lo acepte sin problemas
  return canvas.toDataURL('image/jpeg', 0.8);
}

window.generatePDF_clientes = async function(id){
  const c = await dbGet('clientes',id);
  if(!c){showToast('Cliente no encontrado','error');return}
  const doc = createPDF('Ficha de Cliente');
  let y = 48;
  doc.setFontSize(13); doc.setTextColor(15,23,42); doc.text('Datos del Cliente',14,y); y += 10;
  doc.setFontSize(10); doc.setTextColor(0);
  const lines = [['ID:',c.id],['Tipo:',c.tipo==='empresa'?'Empresa':'Particular'],['Nombre:',c.nombre],['Contacto:',c.contacto||'—'],['Email:',c.email||'—'],['Teléfono:',c.telefono||'—'],['Dirección:',c.direccion||'—']];
  lines.forEach(([l,v])=>{doc.setFont(undefined,'bold');doc.text(l,14,y);doc.setFont(undefined,'normal');doc.text(String(v),55,y);y+=7;});
  if(c.nota){y+=4;doc.setFont(undefined,'bold');doc.text('Notas:',14,y);y+=7;doc.setFont(undefined,'normal');doc.text(c.nota,14,y);}
  addPDFFooter(doc,1); doc.save('cliente_'+c.id+'.pdf'); showToast('PDF de cliente generado');
};

window.generatePDF_presupuesto = async function(id){
  const p = await dbGet('presupuestos',id);
  if(!p){showToast('Presupuesto no encontrado','error');return}
  const doc = createPDF('Presupuesto '+p.id);
  let y = 48;
  doc.setFontSize(11); doc.setTextColor(15,23,42); doc.text('Datos del presupuesto',14,y); y+=8;
  doc.setFontSize(10); doc.setTextColor(0);
  const info = [['Cliente:',p.clienteNombre],['ID:',p.id],['Fecha:',formatDate(p.fecha)],['Válido hasta:',formatDate(p.validoHasta)],['Estado:',getStatusLabel(p.estado)]];
  info.forEach(([l,v])=>{doc.setFont(undefined,'bold');doc.text(l,14,y);doc.setFont(undefined,'normal');doc.text(String(v),55,y);y+=7;});
  y+=6;
  if(p.lineItems && p.lineItems.length>0){
    const tableData = p.lineItems.map((item,i)=>[i+1,item.descripcion||'—',item.tipoId||'—',item.cantidad,formatCurrency(item.precio),formatCurrency(item.cantidad*item.precio)]);
    doc.autoTable({startY:y,head:[['#','Descripción','Tipo','Cantidad','P. Unitario','Subtotal']],body:tableData,theme:'grid',headStyles:{fillColor:[15,23,42],fontSize:8},bodyStyles:{fontSize:8},columnStyles:{0:{cellWidth:10,halign:'center'},2:{cellWidth:30},3:{cellWidth:18,halign:'center'},4:{cellWidth:28},5:{cellWidth:28,halign:'right'}}});
    y = doc.lastAutoTable.finalY + 10;
  }
  doc.setFontSize(10); const right=155; doc.setFont(undefined,'bold');
  doc.text('Subtotal:',right,y); doc.text(formatCurrency(p.subtotal||0),196,y,{align:'right'}); y+=7;
  doc.text('IVA (21%):',right,y); doc.text(formatCurrency(p.iva||0),196,y,{align:'right'}); y+=7;
  doc.setFontSize(13); doc.text('TOTAL:',right,y); doc.text(formatCurrency(p.total||0),196,y,{align:'right'});
  if(p.notas){y+=14;doc.setFontSize(9);doc.setFont(undefined,'normal');doc.text('Notas:',14,y);y+=6;doc.text(p.notas,14,y);}
  addPDFFooter(doc,1); doc.save('presupuesto_'+p.id+'.pdf'); showToast('PDF de presupuesto generado');
};

window.generatePDF_partes = async function(id){
  const p = await dbGet('partesTrabajo', id);
  if(!p){showToast('Parte no encontrado','error');return}

  // ── CARGAR PUERTAS (Paso 7.4) ──
  let puertasTexto = '—';
  if(p.puertaIds && p.puertaIds.length > 0){
    const puertas = await dbGetAll('puertas');
    const mapP = Object.fromEntries(puertas.map(x => [x.id, x.nombre]));
    puertasTexto = p.puertaIds.map(id => mapP[id] || id).join(', ');
  }

  // ── Helpers locales ──
  const pdfSectionTitle = (doc, title, y) => {
    doc.setFontSize(11); doc.setFont(undefined,'bold'); doc.setTextColor(15,23,42);
    doc.text(title.toUpperCase(), 14, y);
    doc.setDrawColor(59,130,246); doc.setLineWidth(0.8);
    doc.line(14, y+1.5, 196, y+1.5);
    doc.setFont(undefined,'normal');
    return y + 7;
  };

  const pdfBox = (doc, x, y, w, h, color) => {
    doc.setFillColor(color[0],color[1],color[2]);
    doc.roundedRect(x,y,w,h,2,2,'F');
  };

  const pdfField = (doc, label, value, x, y) => {
    doc.setFontSize(7); doc.setTextColor(100,116,139);
    doc.text(label.toUpperCase(), x, y-3);
    doc.setFontSize(9.5); doc.setTextColor(15,23,42);
    doc.text(String(value ?? '—'), x, y+1);
  };

  // ── Crear documento jsPDF directamente ──
  const { jsPDF } = window.jspdf || window.jsPDF || {};
  const doc = new jsPDF({unit:'mm', format:'a4'});

  let y = 20;
  const col = (typeof ESTADO_COLOR !== 'undefined' && ESTADO_COLOR[p.estado]) || [100,116,139];

  // ── Encabezado ──
  doc.setFillColor(col[0],col[1],col[2]);
  doc.roundedRect(14,y,45,8,2,2,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont(undefined,'bold');
  const estadoTxt = (typeof getStatusLabel === 'function') ? getStatusLabel(p.estado) : (p.estado||'').toUpperCase();
  doc.text(estadoTxt.toUpperCase(),36.5,y+5.5,{align:'center'});
  doc.setFont(undefined,'normal'); doc.setTextColor(0,0,0); doc.setFontSize(9);
  const fechaTxt = (typeof formatDate === 'function') ? formatDate(p.fecha) : (p.fecha||'');
  doc.text('Fecha: '+fechaTxt,196,y+5.5,{align:'right'}); y+=16;

  // ── Datos del técnico (con DNI) ──
  y = pdfSectionTitle(doc,'Datos del técnico',y);
  pdfBox(doc,14,y,182,14,[241,245,249]);
  pdfField(doc,'Nombre',p.empleadoNombre||'—',20,y+9);
  pdfField(doc,'DNI/NIF',p.empleadoDni||'—',110,y+9);
  y+=20;

  // ── Datos del cliente (con DNI y Ubicacion) ──
  y = pdfSectionTitle(doc,'Datos del cliente',y);
  pdfBox(doc,14,y,182,14,[241,245,249]);
  pdfField(doc,'Cliente',p.clienteNombre||'—',20,y+9);
  pdfField(doc,'DNI/NIF',p.clienteDni||'—',110,y+9);
  y+=20;

  // ── UBICACIÓN (NUEVO) ──
  if(p.ubicacionNombre || p.ubicacionDireccion){
    doc.setDrawColor(59,130,246); doc.setLineWidth(0.6);
    doc.roundedRect(14,y,182,16,2,2,'S');
    doc.setFontSize(9); doc.setTextColor(15,23,42); doc.setFont(undefined,'bold');
    doc.text('📍 Ubicación',20,y+7);
    doc.setFont(undefined,'normal');
    doc.text(String(p.ubicacionNombre||'—'),70,y+7);
    doc.setFontSize(7.5); doc.setTextColor(100,116,139);
    doc.text(String(p.ubicacionDireccion||'—'),70,y+13);
    y+=24;
  }

  // ── Información del servicio (con Horas + Puertas) ──
  y = pdfSectionTitle(doc,'Información del servicio',y);
  pdfBox(doc,14,y,182,36,[241,245,249]);
  pdfField(doc,'Nº Parte',p.id,20,y+9);
  pdfField(doc,'Tipo de puerta',p.tipoPuerta,62,y+9);
  pdfField(doc,'Puertas',puertasTexto,110,y+9);
  pdfField(doc,'Kilómetros',(p.kms||0)+' km',20,y+21);
  pdfField(doc,'Horas',(p.horas||0)+' h',100,y+21);
  pdfField(doc,'Fotos',(p.fotos?.length||0)+' adjunta(s)',150,y+21);
  y+=44;

  // ── Descripción ──
  y = pdfSectionTitle(doc,'Descripción del trabajo',y);
  const descLines = doc.splitTextToSize(p.descripcion||'—',174);
  const descH = Math.max(16, descLines.length*5+10);
  pdfBox(doc,14,y,182,descH,[255,255,255]);
  doc.setFontSize(9.5); doc.setTextColor(30,41,59);
  doc.text(descLines,20,y+8); y+=descH+8;

  // ── Notas ──
  if(p.notas){
    y = pdfSectionTitle(doc,'Notas',y);
    const notasLines = doc.splitTextToSize(p.notas,174);
    const notasH = Math.max(16, notasLines.length*5+10);
    pdfBox(doc,14,y,182,notasH,[254,243,208]);
    doc.setFontSize(9.5); doc.setTextColor(30,41,59);
    doc.text(notasLines,20,y+8); y+=notasH+8;
  }

  // ═══════════ BLOQUE DE FIRMAS (ROBUSTO - SIN SOLAPAMIENTOS) ═══════════
  
  // 1. FORZAR NUEVA PÁGINA: Esto garantiza que las firmas empiecen limpias, 
  // sin importar cuántas páginas ocupen las fotos.
  if(y > 200){ doc.addPage(); y = 25; }
  else { y += 8; }

  // ── 1. DATOS DEL TÉCNICO (Desde BD de empleados) ──
  let emp = null;
  let nombreTecnico = '—';
  let dniTecnico = '—';
  let firmaTecnico = null;

  const claveNombre = Object.keys(p).find(k => 
    k.toLowerCase().includes('nombre') && k.toLowerCase().includes('emple')
  ) || Object.keys(p).find(k => k.toLowerCase().includes('tecnico'))
  || Object.keys(p).find(k => k.toLowerCase().includes('empleado'));

  if(claveNombre && p[claveNombre]){
    nombreTecnico = p[claveNombre];
    try {
      const listaEmp = await dbGetAll('empleados');
      emp = listaEmp.find(e => e.nombre === nombreTecnico) || null;
      if(emp){
        dniTecnico = emp.dni || '—';
        firmaTecnico = emp.firma || null;
      }
    } catch(e) { console.warn('Error leyendo empleados:', e); }
  }

  // ── 2. DATOS DEL CLIENTE (Directamente desde el parte) ──
  const claveFirmaCliente = Object.keys(p).find(k => k.toLowerCase().includes('firma') && k.toLowerCase().includes('cliente')) || null;
  const claveDniCliente = Object.keys(p).find(k => k.toLowerCase().includes('dni') && k.toLowerCase().includes('cliente')) || null;

  const firmaCliente = claveFirmaCliente ? p[claveFirmaCliente] : null;
  const dniCliente = claveDniCliente ? String(p[claveDniCliente]) : '—';

  // ── 3. DIBUJAR EN EL PDF ──
  const boxW = 85, boxH = 32;
  const xIzq = 14, xDer = 196 - boxW;
  const yFirma = y;
  const yDNI = yFirma + boxH + 4;

  // ═══ IZQUIERDA: FIRMA CLIENTE + DNI CLIENTE ═══
  doc.setDrawColor(100,116,139); doc.setLineWidth(0.5);
  doc.roundedRect(xIzq, yFirma, boxW, boxH, 2, 2, 'S');
  doc.setFontSize(8); doc.setTextColor(100,116,139);
  doc.text('FIRMA DEL CLIENTE', xIzq + boxW/2, yFirma + 5, {align:'center'});

  if(firmaCliente){
    try { doc.addImage(firmaCliente, 'PNG', xIzq + 5, yFirma + 8, boxW - 10, boxH - 12); } catch(e){}
  }

  doc.setFontSize(7); doc.setTextColor(100,116,139);
  doc.text('DNI/NIF DEL CLIENTE', xIzq, yDNI);
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.rect(xIzq, yDNI + 2, boxW, 8);
  doc.setFontSize(9.5); doc.setTextColor(15,23,42);
  doc.text(dniCliente, xIzq + boxW/2, yDNI + 7.5, {align:'center'});

  // ═══ DERECHA: FIRMA TÉCNICO + DNI TÉCNICO ═══
  doc.setDrawColor(100,116,139); doc.setLineWidth(0.5);
  doc.roundedRect(xDer, yFirma, boxW, boxH, 2, 2, 'S');
  doc.setFontSize(8); doc.setTextColor(100,116,139);
  doc.text('FIRMA DEL TÉCNICO', xDer + boxW/2, yFirma + 5, {align:'center'});

  if(firmaTecnico){
    try { doc.addImage(firmaTecnico, 'PNG', xDer + 5, yFirma + 8, boxW - 10, boxH - 12); } catch(e){}
  }

  doc.setFontSize(7.5); doc.setTextColor(15,23,42);
  doc.text(nombreTecnico, xDer + boxW/2, yFirma + boxH - 3, {align:'center'});

  doc.setFontSize(7); doc.setTextColor(100,116,139);
  doc.text('DNI/NIF DEL TÉCNICO', xDer, yDNI);
  doc.setDrawColor(150,150,150); doc.setLineWidth(0.4);
  doc.rect(xDer, yDNI + 2, boxW, 8);
  doc.setFontSize(9.5); doc.setTextColor(15,23,42);
  doc.text(dniTecnico, xDer + boxW/2, yDNI + 7.5, {align:'center'});

  y = yDNI + 8 + 8;

  // ═══════════ FIN BLOQUE FIRMAS ═══════════
  // ── Pie de página ──
  doc.setDrawColor(200,200,200); doc.setLineWidth(0.3);
  doc.line(14,y,196,y); y+=6;
  doc.setFontSize(7); doc.setTextColor(100,100,100);
  doc.text('Parte generado el '+new Date().toLocaleString('es-ES'),14,y);
  doc.text('Nº Parte: '+p.id,196,y,{align:'right'});

  doc.save('Parte_'+p.id+'_'+fechaTxt+'.pdf');
};

window.generatePDF_almacen = async function(){
  const items = await dbGetAll('almacen');
  if(!items.length){showToast('No hay artículos en el almacén','error');return}
  const doc = createPDF('Inventario de Almacén');
  doc.autoTable({startY:48,head:[['Ref.','Nombre','Categoría','Unidad','Stock','Mín.','P. Compra','P. Venta','Proveedor']],
  body:items.map(a=>[a.referencia,a.nombre,a.categoria||'—',a.unidad||'unidad',a.stock,a.stockMinimo,formatCurrency(a.precioCompra),formatCurrency(a.precioVenta),a.proveedor||'—']),
  theme:'grid',headStyles:{fillColor:[15,23,42],fontSize:7},bodyStyles:{fontSize:7},columnStyles:{0:{cellWidth:22},1:{cellWidth:45},4:{halign:'center'},5:{halign:'center'},6:{halign:'right'},7:{halign:'right'}}});
  addPDFFooter(doc,1); doc.save('almacen_'+getToday()+'.pdf'); showToast('PDF de almacén generado');
};

window.generatePDF_presupuestos = async function(){
  const presupuestos = await dbGetAll('presupuestos');
  if(!presupuestos.length){showToast('No hay presupuestos','error');return}
  const doc = createPDF('Listado de Presupuestos');
  doc.autoTable({startY:48,head:[['ID','Cliente','Fecha','Válido hasta','Total','Estado']],
  body:presupuestos.map(p=>[p.id,p.clienteNombre,formatDate(p.fecha),formatDate(p.validoHasta),formatCurrency(p.total),getStatusLabel(p.estado)]),
  theme:'grid',headStyles:{fillColor:[15,23,42],fontSize:8},bodyStyles:{fontSize:8}});
  addPDFFooter(doc,1); doc.save('presupuestos_'+getToday()+'.pdf'); showToast('PDF de presupuestos generado');
};