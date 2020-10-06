const express = require('express')
const app = express()
const mySql = require('mysql')
const PORT = 5000
const cors = require('cors')
app.use(cors())

const multer = require('multer')
const singleUpload = require('./helpers/SingleUpload.js')()
const multipleUpload = require('./helpers/MultipleUpload.js')()

const deleteImages = require('./helpers/DeleteImages.js')

require('dotenv').config()
const db = mySql.createConnection({
    user : process.env.DB_USER,
    password : process.env.DB_PASS,
    database : process.env.DB_NAME,
    port : process.env.DB_PORT
})

app.get('/', (req, res) => {
    res.send('Welcome')
})

app.use('/storage', express.static('storage'))



// ############### "SINGLE" UPLOAD FILE TO STORAGE AND SAVE PATHNAME TO DATABASE ###############
app.post('/single-upload-product', (req, res) => {
    // Step1. Upload Image to Storage (API)
    singleUpload(req, res, (err) => {
        try {
            if(err) throw err

            // Step2. Request Validation for Filtering & Filtering If File Does Not Exist
            if(req.filteringValidation) throw { message : req.filteringValidation }
            if(req.file === undefined) throw { message : 'File Not Found'}

            // Step3. Get Image Path
            var imagePath = 'http://localhost:5000/' + req.file.path

            // Step4. Get Text Data {Name , Brand, Category, Etc...} (Data Input From User)
            var data = req.body.data
            try {
                var dataParsed = JSON.parse(data)
                console.log(dataParsed)
            } catch (error) {
                console.log(error)
            }

            // Step5. Insert Data Input From User to "Table Products"
            db.query('INSERT INTO products SET ?;', dataParsed, (err, result) => {
                try {
                    if(err) throw err
                    let id_product = result.insertId

                    console.log(id_product)
                    // Step6. Insert Id Product and Image Path to "Table Products Images"
                    db.query('INSERT INTO products_images SET ?;', {id_product, image : imagePath}, (err, result) => {
                        try {
                            if(err) throw err
                            res.json({
                                error : false, 
                                message : 'Upload Image Success'
                            })
                        } catch (error) {
                            res.json({
                                error : true,
                                message : 'Error When Upload Image',
                                detail : error
                            })
                        }
                    })
                } catch (error) {
                    res.json({
                        error : true, 
                        message : 'Error When Insert Data Product',
                        detail : error
                    })
                }
            })
        } catch (error) {
            res.json({
                error : true, 
                message : error.message
            })
        }
    })
})



// ############### "MULTIPLE" UPLOAD FILE TO STORAGE AND SAVE PATHNAME TO DATABASE WITH HANDLE ERROR ###############
// Ketika Error Saat Query Dijalankan, Maka Image Tidak Tersimpan di Storage dan Data Tidak Tersimpan di Database

app.post('/multiple-upload-product', (req, res) => {
    // Step1. Upload Image to Storage (API)
    multipleUpload(req, res, (err) => {
        try {
            if(err) throw err

            // Step2. Request Validation for Filtering & Filtering If File Does Not Exist
            if(req.filteringValidation) throw { message : req.filteringValidation }
            if(req.files.length === 0) throw { message : 'File Not Found'}

            // Step3. Get Text Data {Name , Brand, Category, Etc...} (Data Input From User)
            var data = req.body.data
            try {
                var dataParsed = JSON.parse(data)
                console.log(dataParsed)
            } catch (error) {
                console.log(error)
            }

            db.beginTransaction((err) => {
                if(err) throw err

                // Step4. Insert Data Input From User to "Table Products"
                db.query('INSERT INTO products SET ?;', dataParsed, (err, result) => {
                    if(err){
                        deleteImages(req.files.map((value) => value.path), req, res) // Berfungsi Apabila Terjadi Error Ditengah-Tengah (Error Saat Query Dijalankan),
                                                                                     // Maka Akan Menghapus Gambar Updatean yang Sudah Terlanjur Tersimpan di Storage (API)
                        return db.rollback(() => {
                            throw err;
                        })
                    }

                    // Step5. Insert Data Image Path to "Table Products Images"
                    //        - Get Id Product
                    let id_product = result.insertId
                    //        - Generate Array of Array
                    let dataImagePath = req.files.map((value) =>{ 
                        return [
                            id_product,
                            'http://localhost:5000/' + value.path
                        ]
                    })

                    db.query('INSERT INTO products_images (id_product, image) VALUES ?;', [dataImagePath], (err, result) => {
                        if(err) {
                            deleteImages(req.files.map((value) => value.path) , req, res) // Berfungsi Apabila Terjadi Error Ditengah-Tengah (Error Saat Query Dijalankan),
                                                                                          // Maka Akan Menghapus Gambar Updatean yang Sudah Terlanjur Tersimpan di Storage (API)
                            return db.rollback(() => {
                                throw err
                            })
                        }

                        db.commit((err) => {
                            if(err){
                                deleteImages(req.files.map((value) => value.path) , req, res) // Berfungsi Apabila Terjadi Error Ditengah-Tengah (Error Saat Query Dijalankan),
                                                                                              // Maka Akan Menghapus Gambar Updatean yang Sudah Terlanjur Tersimpan di Storage (API)
                                return db.rollback(() => {
                                    throw err
                                })
                            }

                            res.send('Upload Image Success')
                        })
                    })
                })
            })
        } catch (error) {
            res.json({
                error : true, 
                message : error.message
            })
        }
    })
})




// ############### GET ALL PRODUCTS ###############
app.get('/products', (req, res) => {
    db.query(`SELECT p.id, p.name, p.brand, p.category, p.price, p.discount, p.stock, p.sold, p.status, pi.id as id_image, pi.image as image FROM footballstoreid.products_images pi
              JOIN footballstoreid.products p on pi.id_product = p.id;`, (err,result) => {
        
        try {
            if(err) throw err

            let dataTransformed = []
            result.forEach((value) => {
                let idProductExist = null

                // Step1. Cek Apakah Id (Id Dari Product) Sudah Ada di Data Transformed
                dataTransformed.forEach((find, index) => {
                    if(find.id === value.id){
                        idProductExist = index
                    }
                })
                
                // Step2. 
                if(idProductExist !== null){
                    // Jika Id (Id Dari Product) Sudah Ada, Maka Push Data Imagenya Saja
                    dataTransformed[idProductExist].images.push({id : value.id_image, url : value.image})
                }else{
                    // Jika Id (Id Dari Product) Belum Ada, Maka Push Data Seperti Berikut
                    dataTransformed.push({
                        id : value.id,
                        name : value.name,
                        brand: value.brand,
                        category : value.category,
                        price : value.price,
                        discount : value.discount,
                        stock : value.stock,
                        sold : value.sold,

                        images : [
                            {
                                id : value.id_image, url : value.image
                            }
                        ]
                    })
                }
            })

            res.json({
                error : false,
                data : dataTransformed
            })
        } catch (error) {
            res.json({
                error : true,
                message : error
            })
        }
    })
})



// ############### UPDATE PER-IMAGE ###############
app.patch('/edit-image/:idImage', (req, res) => {
    const idImage = req.params.idImage

    singleUpload(req, res, (err) => {
        try {
            if(err) throw err

            // Step1. Request Validation for Filtering & Filtering If File Does Not Exist
            if(req.filteringValidation) throw { message : req.filteringValidation }
            if(req.file === undefined) throw { message : 'File Not Found'}

            // Step2. Get New Image Path to Delete ---> (New Image Path to Delete Berfungsi Apabila Terjadi Error 
            //                                          Ditengah-Tengah, Maka Akan Menghapus Gambar Updatean 
            //                                          yang Sudah Terlanjur Tersimpan di Storage (API))
            let newImagePathToDeleteIfError = [req.file.path]

            db.beginTransaction((err) => {
                if(err) throw err

                // Step3. Find Id Image
                //        ALSO Get Path Images yang Lama ---> Untuk Menghapus Images Lama di Storage(API)
                db.query('SELECT * FROM products_images WHERE id = ?;', idImage, (err, result) => {
                    if(err){
                        deleteImages(newImagePathToDeleteIfError, req, res)
                        return db.rollback(() => {
                            throw err
                        })
                    }
    
                    if(result.length === 0){
                        deleteImages(newImagePathToDeleteIfError, req, res)
                        return res.json({
                            error : true,
                            message : 'Id Image Not Found'
                        })
                    }

                    let oldImagePath = [result[0].image.replace('http://localhost:5000/', '')]
                    
                    // Step4. Get New Image Path to Insert
                    let newImagePath = 'http://localhost:5000/' + req.file.path

                    // Step5. Update Image Path yang Lama dengan New Image Path on "Table Products Images"
                    db.query('UPDATE products_images SET ? WHERE id = ?;', [{image : newImagePath}, idImage], (err, result) => {
                        if(err){
                            deleteImages(newImagePathToDeleteIfError, req, res) 
                            return db.rollback(() => {
                                throw err
                            })
                        }
                    
                        // Step6. Delete Old Image on Storage (API)
                        deleteImages(oldImagePath, req, res)

                        db.commit((err) => {
                            if(err){
                                deleteImages(newImagePathToDeleteIfError, req, res)
                                return db.rollback(() => {
                                    throw err
                                })
                            }

                            res.json({
                                error : false,
                                message : "Update Image Success"
                            })
                        })

                    })
                })
            })
        } catch (error) {
            res.json({
                error : true, 
                message : error.message
            })                
        }


    })
})



// ############### DELETE ###############
app.delete('/delete-product/:idProduct', (req, res) => {
    const idProduct = req.params.idProduct

    try {
        if(!idProduct) throw { message : 'Id Product Cannot Null' }

        db.beginTransaction((err) => {
            if(err) throw err

            db.query('SELECT * FROM products WHERE id = ?;', idProduct, (err, result) => {
                if(err){
                    return db.rollback(() => {
                        throw err
                    })
                }

                if(result.length === 0){
                    return res.json({
                        error : true,
                        message : 'Id Product Not Found'
                    })
                }

                // Step1. Delete Product on "Table Products"
                db.query('DELETE from products WHERE id = ?;', idProduct, (err, result) => {
                    if(err){
                        deleteImages(req.files.map((value) => value.path), req, res)
                        return db.rollback(() => {
                            throw err
                        })
                    }
    
                    // Step2. Get Path Images yang Lama ---> Untuk Menghapus Images Lama di Storage(API)
                    db.query('SELECT image from products_images WHERE id_product = ?;', idProduct, (err, result) => {
                        if(err){
                            deleteImages(req.files.map((value) => value.path), req, res)
                            return db.rollback(() => {
                                throw err
                            })
                        }
                        
                        // Step3. Result Dari Query Step2. Yaitu :
                        // result = [
                        //     {image : "path1"},
                        //     {image : "path2"},
                        //     {image : "path3"},
                        // ]
                        
                        //        Akan Diubah Menjadi :
                        // result = ['path1','path2','path3']
                        let oldImagePath = result.map((value) => {
                            return value.image.replace('http://localhost:5000/', '')
                        })
    
                        // Step4. Delete Images on "Table Products Images"
                        db.query('DELETE FROM products_images WHERE id_product = ?;', idProduct, (err, result) => {
                            if(err){
                                deleteImages(req.files.map((value) => value.path), req, res)
                                return db.rollback(() => {
                                    throw err
                                })
                            }
    
                            // Step5. Delete Old Images on Storage (API)
                            deleteImages(oldImagePath, req, res)
    
                            db.commit((err) => {
                                if(err){
                                    deleteImages(req.files.map((value) => value.path), req, res)
                                    return db.rollback(() => {
                                        throw err
                                    })
                                }
    
                                res.json({
                                    error : false,
                                    message : 'Delete Product Success'
                                })
                            })
                        })
                    })
                })
            })
        })
    } catch (error) {
        res.json({
            error : true,
            message : error.message
        })
    }
})



// ############### UPDATE ###############
app.patch('/update-product/:idProduct', (req, res) => {
    // Step1. Upload Image to Storage (API)
    multipleUpload(req, res, (err) => {
        try {
            if(err) throw err

            // Step2. Request Validation for Filtering & Filtering If File Does Not Exist
            if(req.filteringValidation) throw { message : req.filteringValidation }
            if(req.files.length === 0) throw { message : 'File Not Found' }
            
            // Step3. 
            // Get Text Data {Name , Brand, Category, Etc...} (Data Input From User)
            let dataToEdit = req.body.data
            dataToEdit = JSON.parse(dataToEdit)
            const idProduct = req.params.idProduct

            // Get New Image Path to Delete ---> (New Image Path to Delete Berfungsi Apabila Terjadi Error 
            //                                   Ditengah-Tengah, Maka Akan Menghapus Gambar Updatean 
            //                                   yang Sudah Terlanjur Tersimpan di Storage (API))
            let newImagePathToDeleteIfError = req.files.map((value) => {
                return value.path
            })

            db.beginTransaction((err) => {
                if(err) throw err

                db.query('SELECT * FROM products WHERE id = ?;', idProduct, (err, result) => {
                    if(err){
                        deleteImages(newImagePathToDeleteIfError, req, res) // Berfungsi Apabila Terjadi Error Ditengah-Tengah (Error Saat Query Dijalankan),
                                                                            // Maka Akan Menghapus Gambar Updatean yang Sudah Terlanjur Tersimpan di Storage (API)
                        return db.rollback(() => {
                            throw err
                        })
                    }

                    if(result.length === 0){
                        deleteImages(newImagePathToDeleteIfError, req, res) // Berfungsi Apabila Terjadi Error Ditengah-Tengah (Error Saat Query Dijalankan),
                                                                            // Maka Akan Menghapus Gambar Updatean yang Sudah Terlanjur Tersimpan di Storage (API)
                        return res.json({
                            error : true,
                            message : 'Id Product Not Found'
                        })
                    }
                    
                    db.query('UPDATE products SET ? WHERE id = ?;', [dataToEdit, idProduct], (err, result) => {
                        if(err){
                            deleteImages(newImagePathToDeleteIfError, req, res) // Berfungsi Apabila Terjadi Error Ditengah-Tengah (Error Saat Query Dijalankan),
                                                                                // Maka Akan Menghapus Gambar Updatean yang Sudah Terlanjur Tersimpan di Storage (API)
                            return db.rollback(() => {
                                throw err
                            })
                        }
    
                        // Step4. Get Path Images yang Lama ---> Untuk Menghapus Images Lama di Storage(API)
                        db.query('SELECT image from products_images WHERE id_product = ?;', idProduct, (err, result) => {
                            if(err){
                                deleteImages(newImagePathToDeleteIfError, req, res) // Berfungsi Apabila Terjadi Error Ditengah-Tengah (Error Saat Query Dijalankan),
                                                                                    // Maka Akan Menghapus Gambar Updatean yang Sudah Terlanjur Tersimpan di Storage (API)
                                return db.rollback(() => {
                                    throw err
                                })
                            }
    
                            // Step5. Result Dari Query Step4. Yaitu :
                            // result = [
                            //     {image : "path1"},
                            //     {image : "path2"},
                            //     {image : "path3"},
                            // ]
                            
                            //        Akan Diubah Menjadi :
                            // result = ['path1','path2','path3']
                            let oldImagePath = result.map((value) => {
                                return value.image.replace('http://localhost:5000/', '')
                            })
    
                            // Step6. Delete Old Images Path on "Table Products Images"
                            db.query('DELETE FROM products_images WHERE id_product = ?;', idProduct, (err, result) => {
                                if(err){
                                    deleteImages(newImagePathToDeleteIfError, req, res) // Berfungsi Apabila Terjadi Error Ditengah-Tengah (Error Saat Query Dijalankan),
                                                                                        // Maka Akan Menghapus Gambar Updatean yang Sudah Terlanjur Tersimpan di Storage (API)
                                    return db.rollback(() => {
                                        throw err
                                    })
                                }
    
                                // Step7. Get New Image Path to Insert : Generate Array of Array
                                let newImagePath = req.files.map((value) => {
                                    return [
                                        idProduct,
                                        'http://localhost:5000/' + value.path
                                    ]
                                })
    
                                // Step8. Insert Id Product and New Image Path to "Table Products Images"
                                db.query('INSERT INTO products_images (id_product, image) VALUES ?;', [newImagePath], (err, result) => {
                                    if(err){
                                        deleteImages(newImagePathToDeleteIfError, req, res) // Berfungsi Apabila Terjadi Error Ditengah-Tengah (Error Saat Query Dijalankan),
                                                                                            // Maka Akan Menghapus Gambar Updatean yang Sudah Terlanjur Tersimpan di Storage (API)
                                        return db.rollback(() => {
                                            throw err
                                        })
                                    }
    
                                    // Step9. Delete Old Images on Storage (API)
                                    deleteImages(oldImagePath, req, res)
    
                                    db.commit((err) => {
                                        if(err){
                                            deleteImages(newImagePathToDeleteIfError, req, res)
                                            return db.rollback(() => {
                                                throw err
                                            })
                                        }
            
                                        res.json({
                                            error : false,
                                            message : "Update Product Success"
                                        })
                                    })
                                })
                            })
                        })
                    })
                })
            })
        } catch (error) {
            res.json({
                error : true, 
                message : error.message
            })           
        }
    })
})

app.listen(PORT, () => console.log('API RUNNING ON PORT ' + PORT))