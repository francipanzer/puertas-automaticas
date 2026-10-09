# server.py
import os, json, uuid, base64
from http.server import HTTPServer, SimpleHTTPRequestHandler
from datetime import datetime
import mimetypes

PORT = 8000
FOTOS_DIR = 'fotos'
os.makedirs(FOTOS_DIR, exist_ok=True)

mimetypes.add_type('text/javascript', '.js')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('image/x-icon', '.ico')


class Handler(SimpleHTTPRequestHandler):

    def do_POST(self):
        if self.path == '/upload-foto':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length)

                print('--- /upload-foto ---')
                print('Bytes recibidos:', content_length)

                data = json.loads(body.decode())
                parte_id = data['parte_id']
                img_data = data['base64']

                if ',' in img_data:
                    img_data = img_data.split(',', 1)[1]

                # quitar saltos de línea y spaces que a veces trae el base64
                img_data = ''.join(img_data.split())
                # soportar base64 url-safe
                img_data = img_data.replace('-', '+').replace('_', '/')
                # rellenar padding si falta
                img_data += '=' * (-len(img_data) % 4)

                raw = base64.b64decode(img_data)
                print('Bytes imagen tras decodificar:', len(raw))

                fname = f"{parte_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}.jpg"
                dest = os.path.abspath(os.path.join(FOTOS_DIR, fname))
                with open(dest, 'wb') as f:
                    f.write(raw)

                print('Guardado en:', dest)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'url': f'/fotos/{fname}'}).encode())

            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path.startswith('/fotos/') and self.path.endswith('.jpg'):
            fname = os.path.basename(self.path.split('/')[-1])
            fpath = os.path.abspath(os.path.join(FOTOS_DIR, fname))
            if os.path.exists(fpath):
                self.send_response(200)
                self.send_header('Content-Type', 'image/jpeg')
                self.send_header('Cache-Control', 'public, max-age=3600')
                self.end_headers()
                with open(fpath, 'rb') as f:
                    self.wfile.write(f.read())
                return
            else:
                self.send_response(404)
                self.end_headers()
                return

        # Servir el resto de archivos como antes
        super().do_GET()

    def log_message(self, format, *args):
        pass


class Server(HTTPServer):
    def handle_error(self, request, client_address):
        pass


# CAMBIO AQUÍ: '0.0.0.0' en vez de '127.0.0.1'
print(f'🌐 Server AutoPuerta Pro: http://0.0.0.0:{PORT}')
print(f'📸 Carpeta fotos/: {os.path.abspath(FOTOS_DIR)}')
Server(('0.0.0.0', PORT), Handler).serve_forever()