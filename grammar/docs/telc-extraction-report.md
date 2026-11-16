# telc B1 model test extraction

Source label **telc b1 modal tests**. Input file `1842463264_35778_كل نماذج B1 Telc.pdf` from `Documents\German B1`, 220 PDF pages.

The JSON contains **17 named models and 1,000 numbered items**, plus 17 writing prompts and the alternate Lesen Teil 2 printing in SOPHIE. Extraction used the PDF’s embedded text, with duplicate text layers removed and split lines and tables rejoined across page boundaries. OCR was used for scanned Lesen Teil 3 advertisements and the image-only SONJA3 pages. The trainer retains those scans for comparison.

| Answer audit | Items |
| --- | ---: |
| Confirmed against the exercise text or advertisement | 494 |
| Corrected after checking the source exercise | 14 |
| Transcribed from the printed key | 483 |
| Disputed and excluded from scoring | 7 |
| Missing key and excluded from scoring | 2 |

In EVA1 question 26, the sentence requires *trotzdem* and the printed key gives *trotz*. In VIKTOR Lesen Teil 2 question 8, the article says clients first discuss their wishes, so the answer is A. The JSON retains the printed answer and the reason for each correction. VIKTOR’s final key page cuts off listening answers 59 and 60. ANDREAS2 refers readers to ANDREAS for three omitted parts. The PDF contains listening statements but no audio, and it contains no speaking tasks. Listening keys are therefore provided as a reference. Some scanned ad text remains imperfect and the page image is available alongside it.
