from pdfminer.high_level import extract_text

pdf_path = "attached_assets/Funcionalidades_de_un_sistema_de_gestión_gastronómico_1785271816845.pdf"
text = extract_text(pdf_path)
print(text)
