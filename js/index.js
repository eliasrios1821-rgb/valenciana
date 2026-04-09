// =========================================================
// 0. SEGURIDAD Y PROTECCIÓN DE RUTAS (CANDADO)
// =========================================================
// Ocultamos el body por defecto mediante JS para que no "parpadee" la página
document.body.style.display = 'none';

// Escuchamos si hay un usuario activo
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    // Si NO hay usuario, lo pateamos al Login
    window.location.replace('Login-Valenciana.html');
  } else {
    
    // --- MAGIA PARA EL NOMBRE GIGANTE DE LA PORTADA ---
    try {
      let nombreAMostrar = "Invitado"; // Por si acaso
      
      // 1. Buscamos en Firestore (Para los que se registran manual)
      const userDoc = await db.collection("usuarios").doc(user.uid).get();
      if (userDoc.exists && userDoc.data().nombre) {
        nombreAMostrar = userDoc.data().nombre;
      } 
      // 2. Si no está en Firestore, usamos el que nos da Google directamente
      else if (user.displayName) {
        nombreAMostrar = user.displayName;
      }

      // 3. Pintamos el nombre en la pantalla
      const tituloPrincipal = document.querySelector('.nombre-principal');
      if (tituloPrincipal) {
        // Usamos .split(' ')[0] para agarrar solo su primer nombre (Ej: "Elias")
        tituloPrincipal.textContent = nombreAMostrar.split(' ')[0]; 
      }
    } catch (error) {
      console.error("Error al cargar el nombre:", error);
    }

    // Ya con el nombre puesto, hacemos visible la página
    document.body.style.display = 'block';
  }
});

// =========================================================
// 1. CÓDIGO QUE SE EJECUTA CUANDO LA PÁGINA TERMINA DE CARGAR
// =========================================================
document.addEventListener('DOMContentLoaded', () => {

  // --- A. LÓGICA DE LA FECHA DINÁMICA ---
  const fechaActual = new Date();
  const opcionesDeFecha = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  let textoFecha = fechaActual.toLocaleDateString('es-MX', opcionesDeFecha);
  textoFecha = textoFecha.charAt(0).toUpperCase() + textoFecha.slice(1);
  
  const elementoFecha = document.getElementById('fecha-evento');
  if (elementoFecha) {
    elementoFecha.textContent = textoFecha;
  }

  

  // --- B. LÓGICA DEL MENÚ DESPLEGABLE ---
  const btnToggle = document.getElementById('btnToggleMenu');
  const sidebar = document.getElementById('sidebarMenu');
  const backdrop = document.getElementById('backdrop');
  
  // Verificamos que los botones existan para evitar que el código "choque"
  if (btnToggle && sidebar && backdrop) {
    const iconToggle = btnToggle.querySelector('i');

    function toggleMenu() {
      sidebar.classList.toggle('open');
      backdrop.classList.toggle('show');
      
      // Cambiar el ícono de hamburguesa a "X" y viceversa
      if (sidebar.classList.contains('open')) {
        iconToggle.classList.remove('fa-bars');
        iconToggle.classList.add('fa-xmark');
      } else {
        iconToggle.classList.remove('fa-xmark');
        iconToggle.classList.add('fa-bars');
      }
    }

    btnToggle.addEventListener('click', toggleMenu);
    backdrop.addEventListener('click', toggleMenu);
  }

  // --- C. LÓGICA DE CERRAR SESIÓN ---
  const btnCerrar = document.getElementById('btnCerrarSesion');
  if (btnCerrar) {
    btnCerrar.addEventListener('click', () => {
      auth.signOut().then(() => {
        // Una vez cerrada la sesión, lo mandamos al login
        window.location.replace('Login-Valenciana.html');
      }).catch((error) => {
        console.error("Error al cerrar sesión: ", error);
      });
    });
  }

  // --- D. LÓGICA DEL FORMULARIO DE RESERVAS (CONEXIÓN FIREBASE) ---
  const formReserva = document.getElementById('formReserva');
  if (formReserva) {
    formReserva.addEventListener('submit', async (e) => {
      e.preventDefault(); 

      // 1. Verificar si el usuario está logueado
      const user = auth.currentUser;
      if (!user) {
        showToast("¡Ups! Necesitas iniciar sesión para agendar.", "error");
        setTimeout(() => window.location.href = 'Login-Valenciana.html', 2000);
        return;
      }

      // 2. Obtener los datos del formulario
      const nombre = document.getElementById('nombreReserva').value;
      const telefono = document.getElementById('telefonoReserva').value;
      const correo = document.getElementById('correoReserva').value;
      const servicio = document.getElementById('tipoEvento').value;
      const fecha = document.getElementById('fechaCita').value;
      const hora = document.getElementById('horaCita').value;
      const notas = document.getElementById('notasReserva').value;
      const confirmacionWhatsApp = document.getElementById('whatsappReserva').checked;

      // Deshabilitar el botón para que no hagan doble clic
      const btnSubmit = formReserva.querySelector('button[type="submit"]');
      const textoOriginal = btnSubmit.innerHTML;
      btnSubmit.innerHTML = 'Guardando cita... <i class="fa-solid fa-spinner fa-spin"></i>';
      btnSubmit.disabled = true;

      try {
        // 3. Crear el ID único para la regla de "1 cita por día" (uid_fecha)
        const docIdValidacion = `${user.uid}_${fecha}`;
        
        // Usamos un "batch" (lote) para escribir en ambas colecciones al mismo tiempo.
        // Si una falla, la otra se cancela automáticamente.
        const batch = db.batch();

        // A. Referencia para la colección "citas" (Genera un ID aleatorio)
        const nuevaCitaRef = db.collection('citas').doc(); 
        
        // B. Referencia para la colección "citas_por_usuario" (ID estricto)
        const validacionRef = db.collection('citas_por_usuario').doc(docIdValidacion);

        // Los datos exactos que quieres guardar, coincidiendo con tus reglas
        const datosCita = {
          uid: user.uid,              
          fecha: fecha,               
          hora: hora,                 
          servicio: servicio,
          estado: 'pendiente',
          userName: nombre,
          userPhone: telefono,
          userEmail: correo,
          notasAdicionales: notas,
          confirmacionWa: confirmacionWhatsApp,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        const datosValidacion = {
          uid: user.uid,              // Requerido por la regla
          fecha: fecha                // Ayuda a mantener el registro
        };

        // Preparamos las escrituras
        batch.set(nuevaCitaRef, datosCita);
        batch.set(validacionRef, datosValidacion);

        // ¡Ejecutamos la subida a Firebase!
        await batch.commit();

        showToast(`¡Felicidades ${nombre}! Tu cita ha sido agendada.`, 'success');
        
        // NUEVO: Redirección automática a WhatsApp si la casilla está activa
        if (confirmacionWhatsApp) {
            // Armamos un mensaje personalizado con los datos que acaba de llenar
            const mensajeWa = `¡Hola! Acabo de agendar un(a) ${servicio} para el día ${fecha} a las ${hora}. Mi nombre es ${nombre}. Me gustaría confirmar mi reserva y ver los detalles de los pagos.`;
            
            // Creamos el enlace con tu número (8993284044) y el mensaje codificado
            const urlWhatsApp = `https://wa.me/528993284044?text=${encodeURIComponent(mensajeWa)}`;
            
            // Abrimos WhatsApp en una pestaña nueva
            window.open(urlWhatsApp, '_blank');
        }

        formReserva.reset();

      } catch (error) {
        console.error("Error al guardar la cita:", error);
        // Si el error es de permisos, probablemente sea porque ya tiene cita ese día
        if (error.code === 'permission-denied') {
            showToast("Ya tienes una cita para este día. Elige otra fecha.", "error");
        } else {
            showToast("Ocurrió un error al agendar tu cita.", "error");
        }
      } finally {
        // Restaurar el botón
        btnSubmit.innerHTML = textoOriginal;
        btnSubmit.disabled = false;
      }
    });
  }

}); // Fin del evento de carga


// =========================================================
// 2. FUNCIONES GLOBALES (TARJETAS Y MAPA)
// =========================================================

let map; // Variable global del mapa

// --- NAVEGACIÓN ENTRE TARJETAS ---
function mostrarSeccion(idSeccion, elementoLi) {
  // 1. Ocultar todas las tarjetas
  document.querySelectorAll('.section-card').forEach(card => card.classList.remove('active'));
  
  // 2. Quitar el color activo del menú
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  
  // 3. Mostrar la tarjeta seleccionada
  document.getElementById(idSeccion).classList.add('active');
  elementoLi.classList.add('active');

  // 4. Cerrar el menú automáticamente al hacer clic en una opción
  const sidebar = document.getElementById('sidebarMenu');
  if (sidebar && sidebar.classList.contains('open')) {
    document.getElementById('btnToggleMenu').click();
  }

  // 5. Cargar el mapa si entramos a la sección de ubicación
  if(idSeccion === 'ubicacion') {
    setTimeout(inicializarMapa, 650); 
  }
}

// --- MAPA INTERACTIVO (LEAFLET) ---
function inicializarMapa() {
  if (map) {
    // Si ya existe, espera un poco más para recalcular el tamaño
    setTimeout(() => map.invalidateSize(), 800);
    return;
  }

  map = L.map('map-container').setView([26.0697, -98.3072], 16);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  var iconoSalon = L.icon({
      iconUrl: 'https://cdn-icons-png.flaticon.com/512/3199/3199878.png', 
      iconSize:     [40, 40],
      iconAnchor:   [20, 40],
      popupAnchor:  [0, -40]
  });

  var marcadorValenciana = L.marker([26.0697, -98.3072], {icon: iconoSalon}).addTo(map);
  marcadorValenciana.bindPopup("<div style='text-align:center;'><b>Salón Valenciana</b><br>¡Aquí es la fiesta!</div>").openPopup();

  L.Control.geocoder().addTo(map);

  var controlBoton = L.control({position: 'topright'});
  controlBoton.onAdd = function (map) {
      var btn = L.DomUtil.create('button', '');
      btn.style = "background: #2ac0b4; color: white; border: none; padding: 10px 18px; border-radius: 25px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.25); transition: background 0.3s;";
      btn.innerHTML = '📍 Cómo llegar';
      
      L.DomEvent.disableClickPropagation(btn);
      btn.onclick = trazarRuta;
      
      btn.onmouseover = function() { this.style.background = '#24a89d'; }
      btn.onmouseout = function() { this.style.background = '#2ac0b4'; }
      
      return btn;
  };
  controlBoton.addTo(map);
  
  // Refuerzo final de tamaño
  setTimeout(() => {
      map.invalidateSize();
  }, 1000);
}

// --- TRAZADO DINÁMICO DE LA RUTA GPS (LEAFLET CORREGIDO) ---
var rutaActual = null;

function trazarRuta() {
  if (navigator.geolocation) {
      var opcionesGPS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
      
      const routingPanel = document.getElementById('routing-panel');
      if(routingPanel) {
          routingPanel.innerHTML = '<div style="text-align:center; padding: 30px; color: var(--text-gray);"><i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; color: var(--primary-teal); margin-bottom: 10px;"></i><br>Calculando la mejor ruta...</div>';
      }

      navigator.geolocation.getCurrentPosition(function(position) {
          var latUsuario = position.coords.latitude;
          var lngUsuario = position.coords.longitude;
          var latSalon = 26.0697;
          var lngSalon = -98.3072;

          // Borrar la ruta anterior si el usuario vuelve a presionar el botón
          if (rutaActual !== null) {
              map.removeControl(rutaActual);
          }

          rutaActual = L.Routing.control({
              waypoints: [ L.latLng(latUsuario, lngUsuario), L.latLng(latSalon, lngSalon) ],
              language: 'es',
              lineOptions: { styles: [{color: '#2ac0b4', opacity: 0.9, weight: 7}] }, 
              fitSelectedRoutes: true,
              createMarker: function() { return null; },
              show: true,
              collapsible: false,
              
              // ¡EL TRUCO DE ORO! Usar un servidor alternativo más robusto
              router: L.Routing.osrmv1({
                  serviceUrl: 'https://routing.openstreetmap.de/routed-car/route/v1'
              })
          }).addTo(map);

          // Éxito: Dibujar las instrucciones
          rutaActual.on('routesfound', function(e) {
              if(routingPanel) {
                  routingPanel.innerHTML = ''; 
                  routingPanel.appendChild(rutaActual.getContainer()); 
              }
          });

          // Fracaso: Manejar el error sin romper la página
          rutaActual.on('routingerror', function(e) {
              if(routingPanel) {
                  routingPanel.innerHTML = '<div class="indicaciones-vacias" style="color: #dc2626;"><i class="fa-solid fa-triangle-exclamation" style="font-size: 30px; margin-bottom: 10px;"></i><br>El servidor de rutas está saturado. Intenta de nuevo en unos segundos.</div>';
              }
              console.error("Error de ruteo de Leaflet:", e);
          });

          const contenedorOriginal = rutaActual.getContainer();
          if(contenedorOriginal && routingPanel) {
              routingPanel.appendChild(contenedorOriginal);
          }

      }, function(error) {
          if(routingPanel) {
              routingPanel.innerHTML = '<div class="indicaciones-vacias">Asegúrate de encender el GPS para trazar la ruta.</div>';
          }
          showToast("Activa tu GPS y otorga permisos para trazar la ruta.", "error");
      }, opcionesGPS);
  } else {
      showToast("Tu navegador actual no soporta geolocalización.", "error");
  }
}

// --- AUTO-SELECCIÓN DE PAQUETE DEL CATÁLOGO ---
window.seleccionarPaquete = function(nombrePaquete) {
  // 1. Llevamos al usuario a la pestaña de "Reservar"
  const botonReservar = document.querySelectorAll('.nav-item')[1]; // El botón 1 es Reservar
  if (botonReservar) {
    botonReservar.click();
  }
  
  // 2. Escribimos el nombre del paquete en el cuadro de "Notas" para que tú lo veas
  const notasTextarea = document.getElementById('notasReserva');
  if (notasTextarea) {
    notasTextarea.value = `Hola, me interesa el paquete: ${nombrePaquete}.`;
    
    // Le damos un pequeño efecto visual para que el usuario note que se autollenó
    notasTextarea.style.transition = 'background-color 0.5s';
    notasTextarea.style.backgroundColor = '#dcfce7'; // Color verde clarito
    
    setTimeout(() => { 
      notasTextarea.style.backgroundColor = '#ffffff'; 
    }, 1200);
  }
};

// --- E. CARGAR PRECIOS, TÍTULOS Y ETIQUETAS DESDE FIREBASE ---
  db.collection('configuracion').doc('salon').onSnapshot((doc) => {
    if (doc.exists) {
      const config = doc.data();
      
      const actualizarTarjeta = (numero, datos) => {
        if (!datos) return;
        
        const priceEl = document.getElementById(`price-${numero}`);
        const imgEl = document.getElementById(`img-${numero}`);
        const badgeEl = document.getElementById(`badge-${numero}`);

        // Buscamos la tarjeta principal para cambiarle los colores (amarillo o normal)
        let cardEl = null;
        let btnEl = null;
        let titleEl = null;

        if (imgEl) {
           imgEl.src = datos.imagen;
           cardEl = imgEl.closest('.product-card');
           if (cardEl) {
               btnEl = cardEl.querySelector('.btn-product');
               titleEl = cardEl.querySelector('.product-title');
           }
        }

        // Actualizamos Precio y Título
        if (priceEl && datos.precio) priceEl.textContent = datos.precio;
        
        if (titleEl && datos.titulo) {
            titleEl.textContent = datos.titulo;
            
            // ¡LA SOLUCIÓN AQUÍ! 
            // Le cambiamos la acción a la tarjeta para que mande el nombre NUEVO a las notas
            if (cardEl) {
                cardEl.onclick = function() {
                    seleccionarPaquete(datos.titulo);
                };
            }
        }
        
        // Actualizamos la Etiqueta (Promo) y sus colores
        if (badgeEl && cardEl && btnEl) {
          if (datos.promo) {
              badgeEl.style.display = 'block';
              badgeEl.textContent = datos.promoText || 'Destacado';
              
              // Si eligieron "Amarillo (Premium)"
              if (datos.promoStyle === 'yellow') {
                  cardEl.classList.add('premium');
                  badgeEl.classList.add('premium-badge');
                  btnEl.classList.add('premium-btn');
              } else { // Si eligieron "Rojo (Promo)"
                  cardEl.classList.remove('premium');
                  badgeEl.classList.remove('premium-badge');
                  btnEl.classList.remove('premium-btn');
              }
          } else {
              // Si apagaron la palomita, ocultamos la etiqueta y reseteamos el color
              badgeEl.style.display = 'none';
              cardEl.classList.remove('premium');
          }
        }
      };

      actualizarTarjeta(1, config.paquete1);
      actualizarTarjeta(2, config.paquete2);
      actualizarTarjeta(3, config.paquete3);
    }
  });

// =========================================================
// SISTEMA DE ALERTAS BONITAS (TOAST)
// =========================================================
window.showToast = function(mensaje, tipo = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;

  // Ponemos una palomita verde o una advertencia roja según el tipo
  const icono = tipo === 'success' ? '<i class="fa-solid fa-circle-check"></i>' : '<i class="fa-solid fa-circle-exclamation"></i>';
  
  toast.innerHTML = `${icono} <span>${mensaje}</span>`;
  
  // Reseteamos las clases y ponemos la que toca
  toast.className = 'toast';
  toast.classList.add(`toast-${tipo}`);
  
  // Entra a la pantalla
  setTimeout(() => toast.classList.add('show'), 10);

  // Se oculta solita en 4 segundos
  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
};