import fitz
import os

pdf_path = "attached_assets/Funcionalidades_de_un_sistema_de_gestión_gastronómico_1785271816845.pdf"
doc = fitz.open(pdf_path)
print(f"Páginas: {doc.page_count}")

os.makedirs(".agents/outputs/gastro_pdf", exist_ok=True)

for i in range(doc.page_count):
    page = doc[i]
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
    out = f".agents/outputs/gastro_pdf/page_{i+1:02d}.png"
    pix.save(out)
    print(f"Guardado: {out}")

doc.close()
