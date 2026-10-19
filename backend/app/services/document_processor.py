import os
import re
import json
import logging
import unicodedata
from typing import Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session

from app.models.document import Document

logger = logging.getLogger("app")

# Lazy imports / conditional handlers for document processing libraries
fitz = None
docx = None
pptx = None
openpyxl = None
easyocr = None
Image = None

try:
    from PIL import Image
except ImportError:
    Image = None

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

try:
    import docx  # python-docx
except ImportError:
    docx = None

try:
    import pptx  # python-pptx
except ImportError:
    pptx = None

try:
    import openpyxl  # openpyxl
except ImportError:
    openpyxl = None

try:
    import easyocr  # EasyOCR
except ImportError:
    easyocr = None


class DocumentProcessor:
    """
    Module 05: Document Processing Service.
    Handles text extraction, text cleaning, metadata extraction, and OCR for PDF, DOCX, PPTX, XLSX, TXT, CSV, MD, and Images.
    """
    _ocr_reader = None

    @classmethod
    def get_ocr_reader(cls):
        """Lazy loader for EasyOCR reader to save memory until image OCR is requested."""
        if cls._ocr_reader is None and easyocr is not None:
            try:
                logger.info("Initializing EasyOCR reader (English, offline mode)...")
                try:
                    cls._ocr_reader = easyocr.Reader(['en'], gpu=False, download_enabled=False)
                except (TypeError, Exception):
                    cls._ocr_reader = easyocr.Reader(['en'], gpu=False)
            except Exception as e:
                logger.warning(f"Could not initialize EasyOCR reader: {e}")
                cls._ocr_reader = None
        return cls._ocr_reader

    def extract_and_process(self, db: Session, doc_id: int) -> Document:
        """
        Module 05: Document Processing pipeline step.
        Fetches document by ID, marks status as 'processing', extracts raw text,
        cleans text, extracts metadata, updates page and word counts, and marks status as 'processed'.
        """
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            raise ValueError(f"Document ID {doc_id} not found in database.")

        logger.info(f"Starting text extraction and cleaning for doc ID {doc_id} ('{doc.filename}', type: {doc.filetype})...")
        doc.status = "processing"
        doc.error_message = None
        db.commit()

        try:
            raw_text, cleaned_text, metadata, page_count, word_count = self.process_file(doc.filepath, doc.filetype)

            doc.extracted_text = raw_text
            doc.cleaned_text = cleaned_text
            doc.metadata_json = json.dumps(metadata)
            doc.page_count = page_count
            doc.word_count = word_count
            doc.status = "processed"
            doc.error_message = None
            db.commit()
            db.refresh(doc)

            logger.info(f"Document {doc_id} successfully processed. Extracted {word_count} words, {page_count} pages.")
            return doc
        except Exception as e:
            logger.error(f"Error processing document {doc_id} ({doc.filepath}): {e}")
            doc.status = "failed"
            doc.error_message = str(e)
            db.commit()
            raise e

    @staticmethod
    def clean_text(text: str) -> str:
        """
        Cleans and normalizes extracted raw text:
        - Removes NULL bytes and non-printable control characters (preserving tabs and newlines).
        - Normalizes Unicode characters (NFKC format).
        - Standardizes CRLF/CR to LF.
        - Trims excessive horizontal spaces and multiple blank lines.
        """
        if not text:
            return ""

        # Remove null bytes
        text = text.replace("\x00", "")

        # Normalize unicode representation
        text = unicodedata.normalize("NFKC", text)

        # Standardize newlines
        text = re.sub(r"\r\n|\r", "\n", text)

        # Remove non-printable control characters except \n and \t
        text = "".join(ch for ch in text if ch in ("\n", "\t") or (ord(ch) >= 32 and ch != "\x7f"))

        # Replace multiple spaces/tabs per line with single space
        lines = []
        for line in text.split("\n"):
            cleaned_line = re.sub(r"[ \t]+", " ", line).strip()
            lines.append(cleaned_line)

        # Reduce more than 2 consecutive blank lines to 2
        cleaned_text = "\n".join(lines)
        cleaned_text = re.sub(r"\n{3,}", "\n\n", cleaned_text)

        return cleaned_text.strip()

    @staticmethod
    def count_words(text: str) -> int:
        """Calculates accurate word count from text."""
        if not text:
            return 0
        return len(re.findall(r"\b\w+\b", text))

    def process_file(self, filepath: str, filetype: str) -> Tuple[str, str, Dict[str, Any], int, int]:
        """
        Dispatches file processing based on extension.
        Returns:
            (raw_text, cleaned_text, metadata_dict, page_count, word_count)
        """
        filetype = filetype.lower().replace(".", "")
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Physical file not found at path: {filepath}")

        if filetype == "pdf":
            return self._process_pdf(filepath)
        elif filetype == "docx":
            return self._process_docx(filepath)
        elif filetype == "pptx":
            return self._process_pptx(filepath)
        elif filetype in ("xlsx", "xls"):
            return self._process_xlsx(filepath)
        elif filetype in ("txt", "md", "csv"):
            return self._process_text_file(filepath, filetype)
        elif filetype in ("png", "jpg", "jpeg", "bmp", "tiff"):
            return self._process_image(filepath)
        else:
            # Fallback for unknown extension: attempt text read
            return self._process_text_file(filepath, filetype)

    def _process_pdf(self, filepath: str) -> Tuple[str, str, Dict[str, Any], int, int]:
        raw_text_parts = []
        metadata = {"file_type": "PDF"}
        page_count = 0

        if fitz is not None:
            try:
                doc = fitz.open(filepath)
                page_count = len(doc)
                pdf_meta = doc.metadata or {}
                metadata.update({
                    "title": pdf_meta.get("title", ""),
                    "author": pdf_meta.get("author", ""),
                    "subject": pdf_meta.get("subject", ""),
                    "creator": pdf_meta.get("creator", ""),
                    "page_count": page_count
                })

                ocr_needed_pages = []
                for idx, page in enumerate(doc):
                    page_text = page.get_text() or ""
                    if page_text.strip():
                        raw_text_parts.append(f"--- Page {idx + 1} ---\n{page_text}")
                    else:
                        ocr_needed_pages.append(idx + 1)

                # Fallback to OCR if page has no selectable text
                if ocr_needed_pages and easyocr is not None:
                    reader = self.get_ocr_reader()
                    if reader:
                        for page_num in ocr_needed_pages:
                            page = doc[page_num - 1]
                            pix = page.get_pixmap()
                            img_bytes = pix.tobytes("png")
                            ocr_results = reader.readtext(img_bytes, detail=0)
                            ocr_text = "\n".join(ocr_results)
                            if ocr_text.strip():
                                raw_text_parts.append(f"--- Page {page_num} (OCR) ---\n{ocr_text}")

                doc.close()
            except Exception as e:
                logger.error(f"PyMuPDF error reading {filepath}: {e}")
                raw_text_parts.append(f"Error parsing PDF with PyMuPDF: {str(e)}")
        else:
            raw_text_parts.append("PyMuPDF library is not installed on server.")

        raw_text = "\n\n".join(raw_text_parts)
        cleaned_text = self.clean_text(raw_text)
        word_count = self.count_words(cleaned_text)

        return raw_text, cleaned_text, metadata, page_count, word_count

    def _process_docx(self, filepath: str) -> Tuple[str, str, Dict[str, Any], int, int]:
        raw_text_parts = []
        metadata = {"file_type": "DOCX"}
        page_count = 1

        if docx is not None:
            try:
                doc = docx.Document(filepath)
                
                # Metadata
                core_props = doc.core_properties
                metadata.update({
                    "title": core_props.title or "",
                    "author": core_props.author or "",
                    "subject": core_props.subject or "",
                    "created": str(core_props.created) if core_props.created else "",
                    "modified": str(core_props.modified) if core_props.modified else ""
                })

                # Sequential element iteration (paragraphs and tables interleaved in order)
                table_counter = 0
                for child in doc.element.body:
                    tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
                    if tag == 'p':
                        p_text = child.text.strip() if hasattr(child, 'text') and child.text else ""
                        # Use paragraph text if available via python-docx Paragraph helper
                        try:
                            from docx.text.paragraph import Paragraph
                            p_obj = Paragraph(child, doc)
                            p_text = p_obj.text.strip()
                        except Exception:
                            pass
                        if p_text:
                            raw_text_parts.append(p_text)
                    elif tag == 'tbl':
                        table_counter += 1
                        try:
                            from docx.table import Table
                            t_obj = Table(child, doc)
                            t_lines = []
                            for row in t_obj.rows:
                                row_cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                                if row_cells:
                                    t_lines.append(" | ".join(row_cells))
                            if t_lines:
                                raw_text_parts.append(f"--- Table {table_counter} ---\n" + "\n".join(t_lines))
                        except Exception:
                            pass

                # Fallback if body iteration yielded no text
                if not raw_text_parts:
                    for p in doc.paragraphs:
                        if p.text.strip():
                            raw_text_parts.append(p.text.strip())
                    for t_idx, table in enumerate(doc.tables):
                        raw_text_parts.append(f"--- Table {t_idx + 1} ---")
                        for row in table.rows:
                            row_cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                            if row_cells:
                                raw_text_parts.append(" | ".join(row_cells))

            except Exception as e:
                logger.error(f"python-docx error reading {filepath}: {e}")
                raw_text_parts.append(f"Error parsing DOCX: {str(e)}")
        else:
            raw_text_parts.append("python-docx library is not installed on server.")

        raw_text = "\n\n".join(raw_text_parts)
        cleaned_text = self.clean_text(raw_text)
        word_count = self.count_words(cleaned_text)

        return raw_text, cleaned_text, metadata, page_count, word_count

    def _process_pptx(self, filepath: str) -> Tuple[str, str, Dict[str, Any], int, int]:
        raw_text_parts = []
        metadata = {"file_type": "PPTX"}
        slide_count = 0

        if pptx is not None:
            try:
                prs = pptx.Presentation(filepath)
                slide_count = len(prs.slides)
                metadata["page_count"] = slide_count

                for s_idx, slide in enumerate(prs.slides):
                    slide_texts = []
                    for shape in slide.shapes:
                        if hasattr(shape, "text") and shape.text.strip():
                            slide_texts.append(shape.text.strip())

                    if slide_texts:
                        raw_text_parts.append(f"--- Slide {s_idx + 1} ---\n" + "\n".join(slide_texts))

            except Exception as e:
                logger.error(f"python-pptx error reading {filepath}: {e}")
                raw_text_parts.append(f"Error parsing PPTX: {str(e)}")
        else:
            raw_text_parts.append("python-pptx library is not installed on server.")

        raw_text = "\n\n".join(raw_text_parts)
        cleaned_text = self.clean_text(raw_text)
        word_count = self.count_words(cleaned_text)

        return raw_text, cleaned_text, metadata, slide_count, word_count

    def _process_xlsx(self, filepath: str) -> Tuple[str, str, Dict[str, Any], int, int]:
        raw_text_parts = []
        metadata = {"file_type": "XLSX"}
        sheet_count = 0

        if openpyxl is not None:
            try:
                wb = openpyxl.load_workbook(filepath, data_only=True)
                sheet_count = len(wb.sheetnames)
                metadata["sheets"] = wb.sheetnames
                metadata["page_count"] = sheet_count

                for sheet_name in wb.sheetnames:
                    sheet = wb[sheet_name]
                    raw_text_parts.append(f"--- Sheet: {sheet_name} ---")
                    for row in sheet.iter_rows(values_only=True):
                        row_vals = [str(val).strip() for val in row if val is not None and str(val).strip() != ""]
                        if row_vals:
                            raw_text_parts.append(" | ".join(row_vals))

                wb.close()
            except Exception as e:
                logger.error(f"openpyxl error reading {filepath}: {e}")
                raw_text_parts.append(f"Error parsing XLSX: {str(e)}")
        else:
            raw_text_parts.append("openpyxl library is not installed on server.")

        raw_text = "\n\n".join(raw_text_parts)
        cleaned_text = self.clean_text(raw_text)
        word_count = self.count_words(cleaned_text)

        return raw_text, cleaned_text, metadata, sheet_count, word_count

    def _process_text_file(self, filepath: str, filetype: str) -> Tuple[str, str, Dict[str, Any], int, int]:
        raw_text = ""
        metadata = {"file_type": filetype.upper()}
        encodings = ["utf-8", "utf-8-sig", "latin-1", "cp1252"]

        for enc in encodings:
            try:
                with open(filepath, "r", encoding=enc) as f:
                    raw_text = f.read()
                break
            except (UnicodeDecodeError, Exception):
                continue

        cleaned_text = self.clean_text(raw_text)
        word_count = self.count_words(cleaned_text)
        page_count = max(1, len(cleaned_text.split("\n\n")))
        metadata["page_count"] = page_count

        return raw_text, cleaned_text, metadata, page_count, word_count

    def _process_image(self, filepath: str) -> Tuple[str, str, Dict[str, Any], int, int]:
        raw_text_parts = []
        metadata: Dict[str, Any] = {
            "file_type": "IMAGE_OCR",
            "ocr_engine": "EasyOCR (Offline)",
            "ocr_confidence": 0.0,
            "ocr_blocks_count": 0,
            "image_width": 0,
            "image_height": 0,
            "image_format": "IMAGE",
            "page_count": 1
        }

        # Inspect dimensions with PIL
        if Image is not None:
            try:
                with Image.open(filepath) as img:
                    metadata["image_width"] = img.width
                    metadata["image_height"] = img.height
                    metadata["image_format"] = img.format or "IMAGE"
            except Exception as img_err:
                logger.debug(f"Pillow image inspect notice for {filepath}: {img_err}")

        if easyocr is not None:
            try:
                reader = self.get_ocr_reader()
                if reader:
                    # Run OCR with detail=1 to get bbox, text, and confidence scores
                    results = reader.readtext(filepath, detail=1)
                    text_lines = []
                    confidences = []

                    for item in results:
                        # item format: (bbox, text, confidence) or fallback
                        if len(item) >= 3:
                            txt = str(item[1]).strip()
                            try:
                                conf = float(item[2])
                            except (ValueError, TypeError):
                                conf = 1.0
                        elif len(item) == 2:
                            txt = str(item[1]).strip()
                            conf = 1.0
                        else:
                            txt = str(item).strip()
                            conf = 1.0

                        if txt:
                            text_lines.append(txt)
                            confidences.append(conf)

                    if text_lines:
                        raw_text_parts.append("\n".join(text_lines))

                    avg_confidence = round((sum(confidences) / len(confidences)) * 100, 1) if confidences else 0.0
                    metadata["ocr_confidence"] = avg_confidence
                    metadata["ocr_blocks_count"] = len(text_lines)
                else:
                    raw_text_parts.append("EasyOCR model initialization pending.")
                    metadata["ocr_error"] = "Model not initialized"
            except Exception as e:
                logger.error(f"EasyOCR error reading {filepath}: {e}")
                raw_text_parts.append(f"OCR Error: {str(e)}")
                metadata["ocr_error"] = str(e)
        else:
            raw_text_parts.append("EasyOCR library is not installed on server.")
            metadata["ocr_error"] = "easyocr not installed"

        raw_text = "\n\n".join(raw_text_parts)
        cleaned_text = self.clean_text(raw_text)
        word_count = self.count_words(cleaned_text)

        return raw_text, cleaned_text, metadata, 1, word_count


document_processor = DocumentProcessor()

